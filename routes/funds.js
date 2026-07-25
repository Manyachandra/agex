const express = require('express');
const { ethers } = require('ethers');
const walletBalances = require('../services/walletBalances');

const CHAIN_RPC = process.env.CHAIN_RPC_URL || process.env.BASE_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';
const CHAIN_ID = Number(process.env.CHAIN_ID || 4663);
const MIN_ETH = 0.0001; // minimum ETH for add-fund

function createFundsRouter(supabase, io) {
  const router = express.Router();
  const provider = new ethers.JsonRpcProvider(CHAIN_RPC, CHAIN_ID, { staticNetwork: true });

  // ── Verify a native ETH transfer to the agent's wallet on Robinhood Chain ─
  async function verifyEthTransfer(txHash, expectedFrom, expectedTo, expectedAmount) {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const tx = await provider.getTransaction(txHash);
        if (!tx) {
          if (attempt < maxRetries) { await new Promise(r => setTimeout(r, attempt * 2000)); continue; }
          return { valid: false, reason: 'Transaction not found after retries' };
        }
        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt || receipt.status !== 1) {
          if (!receipt && attempt < maxRetries) { await new Promise(r => setTimeout(r, attempt * 2000)); continue; }
          return { valid: false, reason: 'Transaction failed or receipt not available' };
        }
        if (tx.to?.toLowerCase() !== expectedTo.toLowerCase()) {
          return { valid: false, reason: 'ETH not sent to the agent wallet' };
        }
        if (tx.from?.toLowerCase() !== expectedFrom.toLowerCase()) {
          return { valid: false, reason: 'Sender does not match connected wallet' };
        }
        const value = parseFloat(ethers.formatEther(tx.value));
        if (value + 1e-12 < expectedAmount) {
          return { valid: false, reason: `Sent ${value} ETH, expected ${expectedAmount}` };
        }
        return { valid: true, amount: value };
      } catch (err) {
        if (attempt < maxRetries) { await new Promise(r => setTimeout(r, attempt * 2000)); continue; }
        return { valid: false, reason: err.message };
      }
    }
    return { valid: false, reason: 'Verification failed after all retries' };
  }

  // ── POST /api/funds/add ───────────────────────────────────────────────────
  // User sends real ETH directly to the agent's own on-chain wallet on
  // Robinhood Chain. The agent's balance is read live on-chain, so we don't
  // touch the simulated `wallet` field — we just verify the transfer and log it.
  router.post('/add', async (req, res) => {
    try {
      const { agentTicker, userWallet, userId, amount, txHash } = req.body;

      if (!agentTicker || !userWallet || !userId || !amount || !txHash) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount < MIN_ETH) {
        return res.status(400).json({ error: `Minimum amount is ${MIN_ETH} ETH` });
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

      // Fetch agent (need its real wallet address to verify the transfer).
      const { data: agent } = await supabase
        .from('agents')
        .select('*')
        .eq('ticker', agentTicker)
        .single();
      if (!agent) return res.status(404).json({ error: 'Agent not found' });
      if (!agent.wallet_address) {
        return res.status(400).json({ error: 'Agent has no on-chain wallet' });
      }

      // Verify the native ETH transfer landed in the agent's wallet.
      console.log(`Verifying ETH tx ${txHash} for ${parsedAmount} ETH ${userWallet} -> ${agent.wallet_address}...`);
      const verification = await verifyEthTransfer(txHash, userWallet, agent.wallet_address, parsedAmount);
      console.log('ETH verification:', JSON.stringify(verification));
      if (!verification.valid) {
        return res.status(400).json({ error: `TX verification failed: ${verification.reason}` });
      }

      // Record in agent_fund_history (amount stored in ETH for add).
      await supabase.from('agent_fund_history').insert({
        agent_ticker: agentTicker,
        user_id: String(userId).toLowerCase(),
        user_wallet: userWallet,
        type: 'add',
        amount: verification.amount,
        tx_hash: txHash,
        status: 'completed',
        created_at: new Date().toISOString()
      });

      // Activity log
      await supabase.from('activity').insert({
        agent_ticker: agentTicker,
        action: `💰 Funded ${verification.amount} ETH into ${agentTicker}'s on-chain wallet`,
        amount: verification.amount,
        action_type: 'fund_add'
      });

      // Refresh the cached real balance so the UI updates promptly.
      try { await walletBalances.refreshAll(supabase); } catch (e) { /* best effort */ }
      const bal = walletBalances.getBalance(agentTicker);

      if (io) io.emit('fund-update', { type: 'add', agentTicker, ethAmount: verification.amount, realUsd: bal?.usd });

      res.json({ success: true, ethAdded: verification.amount, realUsd: bal?.usd ?? null });
    } catch (err) {
      console.error('Add fund error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  // ── GET /api/funds/history/user/:userId ───────────────────────────────────
  router.get('/history/user/:userId', async (req, res) => {
    try {
      const key = String(req.params.userId || '').toLowerCase().trim();
      const { data } = await supabase
        .from('agent_fund_history')
        .select('*')
        .ilike('user_id', key)
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
