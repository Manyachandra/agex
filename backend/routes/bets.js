const express = require('express');
const { ethers } = require('ethers');

const HOUSE_WALLET = '0x518E341C981D9C64E4c8292fF6C3E8F5055ba256';
const BASE_RPC = 'https://mainnet.base.org';
const MIN_BET_ETH = 0.001;
const MAX_BET_ETH = 0.1;

const BET_TYPES = {
  stays_first_24h: { label: 'Stays #1 for 24 hours', multiplier: 1.8 },
  bankrupt_24h: { label: 'Goes bankrupt within 24 hours', multiplier: 3.0 },
  price_up_next: { label: 'Price goes up next cycle', multiplier: 1.5 },
  price_down_next: { label: 'Price goes down next cycle', multiplier: 1.5 },
};

function createBetsRouter(supabase, io) {
  const router = express.Router();
  const provider = new ethers.JsonRpcProvider(BASE_RPC);

  async function verifyETHTransfer(txHash, expectedFrom, expectedAmount) {
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const tx = await provider.getTransaction(txHash);
        if (!tx) {
          if (attempt < maxRetries) {
            console.log(`  TX not indexed yet, retry ${attempt}/${maxRetries} in ${attempt * 2}s...`);
            await new Promise(r => setTimeout(r, attempt * 2000));
            continue;
          }
          return { valid: false, reason: 'Transaction not found after retries' };
        }

        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt || receipt.status !== 1) {
          if (!receipt && attempt < maxRetries) {
            console.log(`  Receipt not ready, retry ${attempt}/${maxRetries} in ${attempt * 2}s...`);
            await new Promise(r => setTimeout(r, attempt * 2000));
            continue;
          }
          return { valid: false, reason: 'Transaction failed or receipt not available' };
        }

        const txAmountETH = parseFloat(ethers.formatEther(tx.value));
        console.log(`  TX details: from=${tx.from}, to=${tx.to}, value=${txAmountETH} ETH`);

        if (!tx.to || tx.to.toLowerCase() !== HOUSE_WALLET.toLowerCase()) {
          return { valid: false, reason: `Wrong recipient: expected ${HOUSE_WALLET}, got ${tx.to}` };
        }
        if (tx.from.toLowerCase() !== expectedFrom.toLowerCase()) {
          return { valid: false, reason: `Wrong sender: expected ${expectedFrom}, got ${tx.from}` };
        }

        if (txAmountETH < parseFloat(expectedAmount)) {
          return { valid: false, reason: `Insufficient amount: sent ${txAmountETH} ETH, expected >= ${expectedAmount} ETH` };
        }

        return { valid: true };
      } catch (err) {
        if (attempt < maxRetries) {
          console.log(`  Verification error on attempt ${attempt}: ${err.message}`);
          await new Promise(r => setTimeout(r, attempt * 2000));
          continue;
        }
        return { valid: false, reason: err.message };
      }
    }

    return { valid: false, reason: 'Verification failed after all retries' };
  }

  // POST /api/bets/place
  router.post('/place', async (req, res) => {
    try {
      const { userWallet, userId, agentTicker, betType, betAmount, txHash } = req.body;
      console.log('Bet request body:', JSON.stringify({ userWallet, userId, agentTicker, betType, betAmount, txHash }));

      if (!userWallet || !agentTicker || !betType || !betAmount || !txHash || !userId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      if (!BET_TYPES[betType]) {
        return res.status(400).json({ error: 'Invalid bet type' });
      }
      const amount = parseFloat(betAmount);
      if (amount < MIN_BET_ETH || amount > MAX_BET_ETH) {
        return res.status(400).json({ error: `Bet must be between ${MIN_BET_ETH} and ${MAX_BET_ETH} ETH` });
      }

      const { data: existingBet } = await supabase
        .from('bets')
        .select('id')
        .eq('tx_hash', txHash)
        .maybeSingle();
      if (existingBet) {
        return res.status(400).json({ error: 'Transaction already used for a bet' });
      }

      console.log(`Verifying tx ${txHash} for ${amount} ETH from ${userWallet}...`);
      const verification = await verifyETHTransfer(txHash, userWallet, amount);
      console.log('Verification result:', JSON.stringify(verification));
      if (!verification.valid) {
        return res.status(400).json({ error: `TX verification failed: ${verification.reason}` });
      }

      const { data: agent } = await supabase
        .from('agents')
        .select('ticker, price, full_name')
        .eq('ticker', agentTicker)
        .single();
      if (!agent) return res.status(404).json({ error: 'Agent not found' });

      const multiplier = BET_TYPES[betType].multiplier;
      const potentialPayout = parseFloat((amount * multiplier).toFixed(6));
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      if (betType === 'price_up_next' || betType === 'price_down_next') {
        expiresAt.setTime(Date.now() + 15 * 60 * 1000);
      }

      const { data: bet, error } = await supabase
        .from('bets')
        .insert({
          user_wallet: userWallet,
          user_id: userId,
          agent_ticker: agentTicker,
          bet_type: betType,
          bet_amount: amount,
          potential_payout: potentialPayout,
          status: 'active',
          tx_hash: txHash,
          agent_price_at_bet: parseFloat(agent.price),
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('Bet insert error:', error);
        return res.status(500).json({ error: 'Failed to record bet' });
      }

      const { data: walletRow } = await supabase
        .from('user_wallets')
        .select('total_bets')
        .eq('wallet_address', userWallet)
        .maybeSingle();
      if (walletRow) {
        await supabase.from('user_wallets')
          .update({ total_bets: (walletRow.total_bets || 0) + 1 })
          .eq('wallet_address', userWallet);
      }

      try {
        await supabase.from('activity').insert({
          agent_ticker: agentTicker,
          action: `New ${amount} ETH bet: "${BET_TYPES[betType].label}" on ${agentTicker}`,
          amount,
          action_type: 'bet_placed',
        });
      } catch (actErr) {
        console.error('Activity insert error:', actErr.message || actErr);
      }

      if (io) io.emit('bet-placed', { bet, agent });

      res.json({ success: true, bet });
    } catch (err) {
      console.error('Place bet error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  // GET /api/bets/active
  router.get('/active', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('bets')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/bets/user/:userId
  router.get('/user/:userId', async (req, res) => {
    try {
      const { data } = await supabase
        .from('bets')
        .select('*')
        .eq('user_id', req.params.userId)
        .order('created_at', { ascending: false });
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/bets/agent/:ticker
  router.get('/agent/:ticker', async (req, res) => {
    try {
      const { data } = await supabase
        .from('bets')
        .select('*')
        .eq('agent_ticker', req.params.ticker)
        .order('created_at', { ascending: false });
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/bets/pool — aggregate pool data per agent
  router.get('/pool', async (req, res) => {
    try {
      const { data } = await supabase
        .from('bets')
        .select('agent_ticker, bet_type, bet_amount, status')
        .eq('status', 'active');

      const allTypes = Object.keys(BET_TYPES);
      const pool = {};

      for (const bet of (data || [])) {
        if (!pool[bet.agent_ticker]) {
          const by_type = {};
          for (const t of allTypes) {
            by_type[t] = { eth: 0, count: 0 };
          }
          pool[bet.agent_ticker] = { total_eth: 0, total_bets: 0, by_type };
        }
        const amount = parseFloat(bet.bet_amount);
        pool[bet.agent_ticker].total_eth += amount;
        pool[bet.agent_ticker].total_bets++;
        if (pool[bet.agent_ticker].by_type[bet.bet_type]) {
          pool[bet.agent_ticker].by_type[bet.bet_type].eth += amount;
          pool[bet.agent_ticker].by_type[bet.bet_type].count++;
        }
      }

      res.json(pool);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

async function resolveBets(supabase, io) {
  console.log('🎲 Checking expired bets...');

  const { data: expiredBets, error } = await supabase
    .from('bets')
    .select('*')
    .eq('status', 'active')
    .lte('expires_at', new Date().toISOString());

  if (error || !expiredBets?.length) {
    if (expiredBets?.length === 0) console.log('  No expired bets to resolve');
    return;
  }

  console.log(`  Found ${expiredBets.length} expired bets to resolve`);

  const { data: agents } = await supabase
    .from('agents')
    .select('*')
    .order('price', { ascending: false });

  if (!agents?.length) return;

  const topAgent = agents[0];

  const provider = new ethers.JsonRpcProvider(BASE_RPC);
  const wallet = process.env.HOUSE_PRIVATE_KEY
    ? new ethers.Wallet(process.env.HOUSE_PRIVATE_KEY, provider)
    : null;

  for (const bet of expiredBets) {
    try {
      const agent = agents.find(a => a.ticker === bet.agent_ticker);
      if (!agent) {
        await supabase.from('bets').update({ status: 'cancelled', resolved_at: new Date().toISOString() }).eq('id', bet.id);
        continue;
      }

      let won = false;

      const priceAtBet = parseFloat(bet.agent_price_at_bet || agent.price);
      const currentPrice = parseFloat(agent.price);

      switch (bet.bet_type) {
        case 'stays_first_24h':
          won = topAgent.ticker === bet.agent_ticker;
          break;
        case 'bankrupt_24h':
          won = agent.status === 'bankrupt';
          break;
        case 'price_up_next':
          won = currentPrice > priceAtBet;
          break;
        case 'price_down_next':
          won = currentPrice < priceAtBet;
          break;
      }

      const payout = won ? parseFloat((bet.potential_payout * 0.9).toFixed(6)) : 0;
      let payoutTxHash = null;

      if (won && wallet && payout > 0) {
        try {
          const payoutAmount = ethers.parseEther(payout.toString());
          const tx = await wallet.sendTransaction({
            to: bet.user_wallet,
            value: payoutAmount,
          });
          const receipt = await tx.wait();
          payoutTxHash = receipt.hash;
          console.log(`  Paid ${payout} ETH to ${bet.user_wallet} (tx: ${payoutTxHash})`);
        } catch (payErr) {
          console.error(`  Payout failed for bet ${bet.id}:`, payErr.message);
        }
      }

      await supabase.from('bets').update({
        status: won ? 'won' : 'lost',
        result_checked_at: new Date().toISOString(),
        resolved_at: new Date().toISOString(),
        payout_tx_hash: payoutTxHash,
      }).eq('id', bet.id);

      const statusText = won ? `WON ${payout} ETH` : `LOST ${bet.bet_amount} ETH`;
      try {
        await supabase.from('activity').insert({
          agent_ticker: bet.agent_ticker,
          action: `Bet ${statusText}: "${BET_TYPES[bet.bet_type]?.label}" on ${bet.agent_ticker}`,
          amount: won ? payout : parseFloat(bet.bet_amount),
          action_type: won ? 'bet_won' : 'bet_lost',
        });
      } catch (actErr) {
        console.error('Activity insert error:', actErr.message || actErr);
      }

      if (io) io.emit('bet-resolved', { betId: bet.id, won, payout, agentTicker: bet.agent_ticker });

      console.log(`  Bet ${bet.id}: ${bet.agent_ticker} "${bet.bet_type}" → ${won ? 'WON' : 'LOST'}`);
    } catch (err) {
      console.error(`  Error resolving bet ${bet.id}:`, err.message);
    }
  }

  console.log('🎲 Bet resolution complete');
}

module.exports = { createBetsRouter, resolveBets, BET_TYPES };
