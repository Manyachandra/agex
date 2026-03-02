const express = require('express');
const { ethers } = require('ethers');

const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BASE_RPC = 'https://mainnet.base.org';
const MIN_AMOUNT = 1; // $1 minimum

// USDC ABI — only what we need
const USDC_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

function createFundsRouter(supabase, io) {
  const router = express.Router();
  const provider = new ethers.JsonRpcProvider(BASE_RPC);

  const HOUSE_WALLET = process.env.HOUSE_WALLET_ADDRESS;

  // ── Verify USDC transfer on Base ──────────────────────────────────────────
  async function verifyUSDCTransfer(txHash, expectedFrom, expectedAmount) {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const tx = await provider.getTransaction(txHash);
        if (!tx) {
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, attempt * 2000));
            continue;
          }
          return { valid: false, reason: 'Transaction not found after retries' };
        }

        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt || receipt.status !== 1) {
          if (!receipt && attempt < maxRetries) {
            await new Promise(r => setTimeout(r, attempt * 2000));
            continue;
          }
          return { valid: false, reason: 'Transaction failed or receipt not available' };
        }

        // Parse USDC Transfer event from logs
        const usdcInterface = new ethers.Interface(USDC_ABI);
        let transferFound = false;
        let transferAmount = 0;
        let transferFrom = '';

        for (const log of receipt.logs) {
          try {
            if (log.address.toLowerCase() !== USDC_CONTRACT.toLowerCase()) continue;
            const parsed = usdcInterface.parseLog(log);
            if (parsed && parsed.name === 'Transfer') {
              transferFrom = parsed.args[0].toLowerCase();
              const toAddr = parsed.args[1].toLowerCase();
              // USDC has 6 decimals
              transferAmount = parseFloat(ethers.formatUnits(parsed.args[2], 6));

              if (
                toAddr === HOUSE_WALLET.toLowerCase() &&
                transferFrom === expectedFrom.toLowerCase() &&
                transferAmount >= expectedAmount
              ) {
                transferFound = true;
                break;
              }
            }
          } catch (e) { continue; }
        }

        if (!transferFound) {
          return { valid: false, reason: `USDC transfer to house wallet not found. Got from=${transferFrom}, amount=${transferAmount}` };
        }

        return { valid: true, amount: transferAmount };
      } catch (err) {
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, attempt * 2000));
          continue;
        }
        return { valid: false, reason: err.message };
      }
    }
    return { valid: false, reason: 'Verification failed after all retries' };
  }

  // ── POST /api/funds/add ───────────────────────────────────────────────────
  // User sends USDC to house wallet → agent wallet increases
  router.post('/add', async (req, res) => {
    try {
      const { agentTicker, userWallet, userId, amount, txHash } = req.body;

      if (!agentTicker || !userWallet || !userId || !amount || !txHash) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount < MIN_AMOUNT) {
        return res.status(400).json({ error: `Minimum amount is $${MIN_AMOUNT}` });
      }

      // Prevent duplicate TX
      const { data: existingTx } = await supabase
        .from('agent_fund_history')
        .select('id')
        .eq('tx_hash', txHash)
        .maybeSingle();
      if (existingTx) {
        return res.status(400).json({ error: 'Transaction already used' });
      }

      // Verify USDC transfer on chain
      console.log(`Verifying USDC tx ${txHash} for $${parsedAmount} from ${userWallet}...`);
      const verification = await verifyUSDCTransfer(txHash, userWallet, parsedAmount);
      console.log('Verification:', JSON.stringify(verification));

      if (!verification.valid) {
        return res.status(400).json({ error: `TX verification failed: ${verification.reason}` });
      }

      // Fetch agent
      const { data: agent } = await supabase
        .from('agents')
        .select('*')
        .eq('ticker', agentTicker)
        .single();
      if (!agent) return res.status(404).json({ error: 'Agent not found' });

      // Add to agent wallet
      const newWallet = parseFloat(agent.wallet) + parsedAmount;
      await supabase.from('agents').update({
        wallet: newWallet,
        updated_at: new Date()
      }).eq('ticker', agentTicker);

      // Record in agent_fund_history table
      await supabase.from('agent_fund_history').insert({
        agent_ticker: agentTicker,
        user_id: userId,
        user_wallet: userWallet,
        type: 'add',
        amount: parsedAmount,
        tx_hash: txHash,
        status: 'completed',
        created_at: new Date().toISOString()
      });

      // Activity log
      await supabase.from('activity').insert({
        agent_ticker: agentTicker,
        action: `💰 Fund added $${parsedAmount.toFixed(2)} to wallet — new balance $${newWallet.toFixed(2)}`,
        amount: parsedAmount,
        action_type: 'fund_add'
      });

      if (io) io.emit('fund-update', { type: 'add', agentTicker, amount: parsedAmount, newWallet });

      res.json({ success: true, newWallet, amount: parsedAmount });
    } catch (err) {
      console.error('Add fund error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  // ── POST /api/funds/remove ────────────────────────────────────────────────
  // Agent wallet decreases → house sends USDC back to user
  router.post('/remove', async (req, res) => {
    try {
      const { agentTicker, userWallet, userId, amount } = req.body;

      if (!agentTicker || !userWallet || !userId || !amount) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount < MIN_AMOUNT) {
        return res.status(400).json({ error: `Minimum withdrawal is $${MIN_AMOUNT}` });
      }
      if (!agent) return res.status(404).json({ error: 'Agent not found' });
      if (!['active', 'dominant'].includes(agent.status)) {
        return res.status(400).json({ error: 'Cannot remove funds from an agent that is not active' });
      }

      // Fetch agent
      const { data: agent } = await supabase
        .from('agents')
        .select('*')
        .eq('ticker', agentTicker)
        .single();
      if (!agent) return res.status(404).json({ error: 'Agent not found' });

      // Check sufficient balance
      if (parseFloat(agent.wallet) < parsedAmount) {
        return res.status(400).json({ error: `Insufficient wallet balance. Available: $${parseFloat(agent.wallet).toFixed(2)}` });
      }

      // Deduct from agent wallet first
      const newWallet = parseFloat(agent.wallet) - parsedAmount;
      await supabase.from('agents').update({
        wallet: newWallet,
        updated_at: new Date()
      }).eq('ticker', agentTicker);

      // Send USDC from house wallet to user
      let payoutTxHash = null;
      const housePrivateKey = process.env.HOUSE_PRIVATE_KEY;

      if (housePrivateKey) {
        try {
          const houseWallet = new ethers.Wallet(housePrivateKey, provider);
          const usdc = new ethers.Contract(USDC_CONTRACT, USDC_ABI, houseWallet);
          const usdcAmount = ethers.parseUnits(parsedAmount.toFixed(6), 6);
          const tx = await usdc.transfer(userWallet, usdcAmount);
          const receipt = await tx.wait();
          payoutTxHash = receipt.hash;
          console.log(`✅ Sent ${parsedAmount} USDC → ${userWallet} (${payoutTxHash})`);
        } catch (payErr) {
          console.error('USDC send error:', payErr.message);
          // Rollback wallet deduction if tx fails
          await supabase.from('agents').update({
            wallet: parseFloat(agent.wallet),
            updated_at: new Date()
          }).eq('ticker', agentTicker);
          return res.status(500).json({ error: 'Failed to send USDC. Please try again.' });
        }
      } else {
        console.warn('⚠️ HOUSE_PRIVATE_KEY not set — USDC payout skipped');
      }

      // Record in agent_fund_history table
      await supabase.from('agent_fund_history').insert({
        agent_ticker: agentTicker,
        user_id: userId,
        user_wallet: userWallet,
        type: 'remove',
        amount: parsedAmount,
        tx_hash: payoutTxHash,
        status: 'completed',
        created_at: new Date().toISOString()
      });

      // Activity log
      await supabase.from('activity').insert({
        agent_ticker: agentTicker,
        action: `💸 Fund removed $${parsedAmount.toFixed(2)} from wallet — new balance $${newWallet.toFixed(2)}`,
        amount: parsedAmount,
        action_type: 'fund_remove'
      });

      if (io) io.emit('fund-update', { type: 'remove', agentTicker, amount: parsedAmount, newWallet });

      res.json({ success: true, newWallet, amount: parsedAmount, txHash: payoutTxHash });
    } catch (err) {
      console.error('Remove fund error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  // ── POST /api/funds/withdraw-rewards ─────────────────────────────────────
  // total_earned → USDC ($100 earned = $5 USDC)
  router.post('/withdraw-rewards', async (req, res) => {
    try {
      const { agentTicker, userWallet, userId, amount } = req.body;

      if (!agentTicker || !userWallet || !userId || !amount) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const parsedAmount = parseFloat(amount); // in-game $ amount to withdraw
      if (isNaN(parsedAmount) || parsedAmount < 1) {
        return res.status(400).json({ error: 'Minimum reward withdrawal is $1 in-game' });
      }

      // Fetch agent
      const { data: agent } = await supabase
        .from('agents')
        .select('*')
        .eq('ticker', agentTicker)
        .single();
      if (!agent) return res.status(404).json({ error: 'Agent not found' });

      const totalEarned = parseFloat(agent.total_earned || 0);
      if (totalEarned < parsedAmount) {
        return res.status(400).json({ error: `Insufficient earned balance. Available: $${totalEarned.toFixed(2)}` });
      }

      // Calculate USDC payout: $100 in-game = $5 USDC
      const usdcPayout = parseFloat(((parsedAmount / 100) * 5).toFixed(6));
      if (usdcPayout < 0.01) {
        return res.status(400).json({ error: 'Amount too small to withdraw' });
      }

      // Deduct from total_earned
      const newTotalEarned = totalEarned - parsedAmount;
      await supabase.from('agents').update({
        total_earned: newTotalEarned,
        updated_at: new Date()
      }).eq('ticker', agentTicker);

      // Send USDC from house wallet
      let payoutTxHash = null;
      const housePrivateKey = process.env.HOUSE_PRIVATE_KEY;

      if (housePrivateKey) {
        try {
          const houseWallet = new ethers.Wallet(housePrivateKey, provider);
          const usdc = new ethers.Contract(USDC_CONTRACT, USDC_ABI, houseWallet);
          const usdcAmount = ethers.parseUnits(usdcPayout.toFixed(6), 6);
          const tx = await usdc.transfer(userWallet, usdcAmount);
          const receipt = await tx.wait();
          payoutTxHash = receipt.hash;
          console.log(`✅ Sent ${usdcPayout} USDC rewards → ${userWallet} (${payoutTxHash})`);
        } catch (payErr) {
          console.error('Reward USDC send error:', payErr.message);
          // Rollback
          await supabase.from('agents').update({
            total_earned: totalEarned,
            updated_at: new Date()
          }).eq('ticker', agentTicker);
          return res.status(500).json({ error: 'Failed to send USDC. Please try again.' });
        }
      } else {
        console.warn('⚠️ HOUSE_PRIVATE_KEY not set — reward payout skipped');
      }

      // Record in agent_fund_history table
      await supabase.from('agent_fund_history').insert({
        agent_ticker: agentTicker,
        user_id: userId,
        user_wallet: userWallet,
        type: 'reward_withdraw',
        amount: parsedAmount,
        usdc_amount: usdcPayout,
        tx_hash: payoutTxHash,
        status: 'completed',
        created_at: new Date().toISOString()
      });

      // Activity log
      await supabase.from('activity').insert({
        agent_ticker: agentTicker,
        action: `🏆 Reward withdrawn $${parsedAmount.toFixed(2)} in-game → ${usdcPayout} USDC real`,
        amount: usdcPayout,
        action_type: 'reward_withdraw'
      });

      if (io) io.emit('fund-update', { type: 'reward_withdraw', agentTicker, amount: parsedAmount, usdcPayout });

      res.json({ success: true, newTotalEarned, usdcPayout, txHash: payoutTxHash });
    } catch (err) {
      console.error('Withdraw rewards error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });
  // ── GET /api/funds/history/user/:userId ───────────────────────────────────
  router.get('/history/user/:userId', async (req, res) => {
    try {
      const { data } = await supabase
        .from('agent_fund_history')
        .select('*')
        .eq('user_id', req.params.userId)
        .order('created_at', { ascending: false })
        .limit(50);
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/funds/history/:agentTicker ───────────────────────────────────
  router.get('/history/:agentTicker', async (req, res) => {
    try {
      const { data } = await supabase
        .from('agent_fund_history')
        .select('*')
        .eq('agent_ticker', req.params.agentTicker)
        .order('created_at', { ascending: false })
        .limit(50);
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createFundsRouter };