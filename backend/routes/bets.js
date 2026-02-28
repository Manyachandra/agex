const express = require('express');
const { ethers } = require('ethers');

const HOUSE_WALLET = '0x518E341C981D9C64E4c8292fF6C3E8F5055ba256';
const BASE_RPC = 'https://mainnet.base.org';
const MIN_BET_ETH = 0.001;
const MAX_BET_ETH = 0.1;

// All 4 original bet types — multipliers REMOVED.
// Payouts are now based on the real % price change at resolution time.
const BET_TYPES = {
  stays_first_24h: { label: 'Stays #1 for 24 hours',        duration: 24 * 60 * 60 * 1000 },
  bankrupt_24h:    { label: 'Goes bankrupt within 24 hours', duration: 24 * 60 * 60 * 1000 },
  price_up_next:   { label: 'Price goes up next cycle',      duration: 15 * 60 * 1000 },
  price_down_next: { label: 'Price goes down next cycle',    duration: 15 * 60 * 1000 },
};

// ─────────────────────────────────────────────────────────────────────────────
// PAYOUT RULES (all types):
//
//  price_up_next   — user bets price rises
//    RIGHT (price up)   → bet + (bet × changePct)         e.g. +10% → +10% profit
//    WRONG (price down) → bet − (bet × |changePct|)       e.g. −8%  → −8% loss
//
//  price_down_next — user bets price falls
//    RIGHT (price down) → bet + (bet × |changePct|)       e.g. −12% → +12% profit
//    WRONG (price up)   → bet − (bet × changePct)         e.g. +15% → −15% loss
//
//  stays_first_24h — user bets agent keeps #1 rank
//    RIGHT (still #1)   → bet + (bet × price gain %)      gain % of agent since bet
//    WRONG (lost #1)    → bet − (bet × price drop %)
//
//  bankrupt_24h    — user bets agent goes bankrupt
//    RIGHT (bankrupt)   → bet + (bet × price drop %)      big drop = big reward
//    WRONG (survived)   → bet − (bet × price rise %)
//
//  ALL payouts are floored at 0 — user never loses more than their original bet.
// ─────────────────────────────────────────────────────────────────────────────

function createBetsRouter(supabase, io) {
  const router = express.Router();
  const provider = new ethers.JsonRpcProvider(BASE_RPC);

  // ── Verify ETH transaction on Base ────────────────────────────────────────
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
        console.log(`  TX: from=${tx.from}, to=${tx.to}, value=${txAmountETH} ETH`);

        if (!tx.to || tx.to.toLowerCase() !== HOUSE_WALLET.toLowerCase()) {
          return { valid: false, reason: `Wrong recipient: expected ${HOUSE_WALLET}, got ${tx.to}` };
        }
        if (tx.from.toLowerCase() !== expectedFrom.toLowerCase()) {
          return { valid: false, reason: `Wrong sender: expected ${expectedFrom}, got ${tx.from}` };
        }
        if (txAmountETH < parseFloat(expectedAmount)) {
          return { valid: false, reason: `Insufficient: sent ${txAmountETH} ETH, expected >= ${expectedAmount} ETH` };
        }
        return { valid: true };
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

  // ── POST /api/bets/place ──────────────────────────────────────────────────
  router.post('/place', async (req, res) => {
    try {
      const { userWallet, userId, agentTicker, betType, betAmount, txHash } = req.body;
      console.log('Bet request:', JSON.stringify({ userWallet, userId, agentTicker, betType, betAmount, txHash }));

      if (!userWallet || !agentTicker || !betType || !betAmount || !txHash || !userId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      if (!BET_TYPES[betType]) {
        return res.status(400).json({ error: 'Invalid bet type' });
      }
      const amount = parseFloat(betAmount);
      if (isNaN(amount) || amount < MIN_BET_ETH || amount > MAX_BET_ETH) {
        return res.status(400).json({ error: `Bet must be between ${MIN_BET_ETH} and ${MAX_BET_ETH} ETH` });
      }

      // Prevent duplicate TX
      const { data: existingBet } = await supabase
        .from('bets').select('id').eq('tx_hash', txHash).maybeSingle();
      if (existingBet) {
        return res.status(400).json({ error: 'Transaction already used for a bet' });
      }

      // Verify on-chain
      console.log(`Verifying tx ${txHash} for ${amount} ETH from ${userWallet}...`);
      const verification = await verifyETHTransfer(txHash, userWallet, amount);
      console.log('Verification:', JSON.stringify(verification));
      if (!verification.valid) {
        return res.status(400).json({ error: `TX verification failed: ${verification.reason}` });
      }

      // Fetch agent
      const { data: agent } = await supabase
        .from('agents').select('ticker, price, full_name, status').eq('ticker', agentTicker).single();
      if (!agent) return res.status(404).json({ error: 'Agent not found' });
      if (!['active', 'dominant'].includes(agent.status)) {
        return res.status(400).json({ error: 'Can only bet on active agents' });
      }

      const priceAtBet = parseFloat(agent.price);
      const expiresAt  = new Date(Date.now() + BET_TYPES[betType].duration);

      // potential_payout stored as bet amount initially; real value written at resolution
      const { data: bet, error } = await supabase.from('bets').insert({
        user_wallet:        userWallet,
        user_id:            userId,
        agent_ticker:       agentTicker,
        bet_type:           betType,
        bet_amount:         amount,
        potential_payout:   amount,
        status:             'active',
        tx_hash:            txHash,
        agent_price_at_bet: priceAtBet,
        expires_at:         expiresAt.toISOString(),
        created_at:         new Date().toISOString(),
      }).select().single();

      if (error) {
        console.error('Bet insert error:', error);
        return res.status(500).json({ error: 'Failed to record bet' });
      }

      // Update user_wallets
      const { data: walletRow } = await supabase
        .from('user_wallets').select('total_bets').eq('wallet_address', userWallet).maybeSingle();
      if (walletRow) {
        await supabase.from('user_wallets')
          .update({ total_bets: (walletRow.total_bets || 0) + 1 }).eq('wallet_address', userWallet);
      } else {
        await supabase.from('user_wallets').insert({
          user_id: userId, wallet_address: userWallet,
          total_bets: 1, total_won: 0, total_lost: 0,
          connected_at: new Date().toISOString()
        });
      }

      try {
        await supabase.from('activity').insert({
          agent_ticker: agentTicker,
          action: `🎲 New ${amount} ETH bet: "${BET_TYPES[betType].label}" on ${agentTicker} — price locked at $${priceAtBet}`,
          amount,
          action_type: 'bet_placed',
        });
      } catch (actErr) { console.error('Activity insert error:', actErr.message); }

      if (io) io.emit('bet-placed', { bet, agent });

      res.json({ success: true, bet, priceAtBet, expiresAt: expiresAt.toISOString() });
    } catch (err) {
      console.error('Place bet error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  // ── GET /api/bets/active ──────────────────────────────────────────────────
  router.get('/active', async (req, res) => {
    try {
      const { data } = await supabase.from('bets').select('*').eq('status', 'active')
        .order('created_at', { ascending: false });
      res.json(data || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── GET /api/bets/user/:userId ────────────────────────────────────────────
  router.get('/user/:userId', async (req, res) => {
    try {
      const { data } = await supabase.from('bets').select('*').eq('user_id', req.params.userId)
        .order('created_at', { ascending: false });
      res.json(data || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── GET /api/bets/agent/:ticker ───────────────────────────────────────────
  router.get('/agent/:ticker', async (req, res) => {
    try {
      const { data } = await supabase.from('bets').select('*').eq('agent_ticker', req.params.ticker)
        .order('created_at', { ascending: false });
      res.json(data || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── GET /api/bets/pool ────────────────────────────────────────────────────
  router.get('/pool', async (req, res) => {
    try {
      const { data } = await supabase.from('bets')
        .select('agent_ticker, bet_type, bet_amount, status').eq('status', 'active');

      const allTypes = Object.keys(BET_TYPES);
      const pool = {};

      for (const bet of (data || [])) {
        if (!pool[bet.agent_ticker]) {
          const by_type = {};
          for (const t of allTypes) by_type[t] = { eth: 0, count: 0 };
          pool[bet.agent_ticker] = { total_eth: 0, total_bets: 0, by_type };
        }
        const a = parseFloat(bet.bet_amount);
        pool[bet.agent_ticker].total_eth  += a;
        pool[bet.agent_ticker].total_bets += 1;
        if (pool[bet.agent_ticker].by_type[bet.bet_type]) {
          pool[bet.agent_ticker].by_type[bet.bet_type].eth   += a;
          pool[bet.agent_ticker].by_type[bet.bet_type].count += 1;
        }
      }
      for (const key of Object.keys(pool)) {
        pool[key].total_eth = parseFloat(pool[key].total_eth.toFixed(6));
        for (const t of allTypes) {
          pool[key].by_type[t].eth = parseFloat(pool[key].by_type[t].eth.toFixed(6));
        }
      }

      res.json(pool);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  return router;
}

// ── resolveBets — called by scheduler every 5 min ────────────────────────────
async function resolveBets(supabase, io) {
  console.log('🎲 Checking expired bets...');

  const { data: expiredBets, error } = await supabase
    .from('bets').select('*').eq('status', 'active')
    .lte('expires_at', new Date().toISOString());

  if (error) { console.error('  Fetch error:', error.message); return; }
  if (!expiredBets?.length) { console.log('  No expired bets'); return; }

  console.log(`  Found ${expiredBets.length} expired bet(s)`);

  const { data: agents } = await supabase.from('agents').select('*').order('price', { ascending: false });
  if (!agents?.length) return;

  const topAgent = agents[0];

  const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
  const wallet = process.env.HOUSE_PRIVATE_KEY
    ? new ethers.Wallet(process.env.HOUSE_PRIVATE_KEY, provider)
    : null;

  if (!wallet) console.warn('  ⚠️  HOUSE_PRIVATE_KEY not set — ETH payouts skipped');

  for (const bet of expiredBets) {
    try {
      const agent = agents.find(a => a.ticker === bet.agent_ticker);

      // Agent deleted — cancel bet
      if (!agent) {
        await supabase.from('bets').update({
          status: 'cancelled',
          resolved_at: new Date().toISOString(),
          result_checked_at: new Date().toISOString(),
        }).eq('id', bet.id);
        console.log(`  Bet ${bet.id}: agent gone — cancelled`);
        continue;
      }

      const priceAtBet   = parseFloat(bet.agent_price_at_bet || agent.price);
      const currentPrice = parseFloat(agent.price);
      const betAmount    = parseFloat(bet.bet_amount);

      // Raw % change: positive = price rose, negative = price fell
      const rawChangePct = priceAtBet > 0
        ? (currentPrice - priceAtBet) / priceAtBet
        : 0;

      let payout = 0;
      let userWasRight = false;
      let resultNote = '';

      switch (bet.bet_type) {

        case 'price_up_next': {
          if (rawChangePct >= 0) {
            // RIGHT — price went up → bet + same % gain
            userWasRight = true;
            payout = betAmount + (betAmount * rawChangePct);
            resultNote = `Price +${(rawChangePct * 100).toFixed(2)}% ✅`;
          } else {
            // WRONG — price went down → bet minus same % loss
            userWasRight = false;
            payout = betAmount + (betAmount * rawChangePct); // rawChangePct negative = subtracts
            resultNote = `Price ${(rawChangePct * 100).toFixed(2)}% ❌`;
          }
          break;
        }

        case 'price_down_next': {
          if (rawChangePct <= 0) {
            // RIGHT — price went down → bet + same % profit (magnitude of drop)
            userWasRight = true;
            payout = betAmount + (betAmount * Math.abs(rawChangePct));
            resultNote = `Price ${(rawChangePct * 100).toFixed(2)}% ✅`;
          } else {
            // WRONG — price went up → bet minus same % loss
            userWasRight = false;
            payout = betAmount - (betAmount * rawChangePct);
            resultNote = `Price +${(rawChangePct * 100).toFixed(2)}% ❌`;
          }
          break;
        }

        case 'stays_first_24h': {
          const isStillFirst = topAgent.ticker === bet.agent_ticker;
          if (isStillFirst) {
            // RIGHT — still #1 → bet + % price gained
            userWasRight = true;
            const gainPct = Math.max(0, rawChangePct);
            payout = betAmount + (betAmount * gainPct);
            resultNote = `${bet.agent_ticker} stays #1 ✅ price ${gainPct >= 0 ? '+' : ''}${(gainPct * 100).toFixed(2)}%`;
          } else {
            // WRONG — lost #1 → bet minus % price dropped
            userWasRight = false;
            const dropPct = Math.abs(Math.min(0, rawChangePct));
            payout = betAmount - (betAmount * dropPct);
            resultNote = `${bet.agent_ticker} lost #1 ❌ price ${(rawChangePct * 100).toFixed(2)}%`;
          }
          break;
        }

        case 'bankrupt_24h': {
          const isBankrupt = agent.status === 'bankrupt';
          if (isBankrupt) {
            // RIGHT — bankrupt → price near 0 → big drop % = big reward
            userWasRight = true;
            const dropMagnitude = Math.abs(rawChangePct);
            payout = betAmount + (betAmount * dropMagnitude);
            resultNote = `${bet.agent_ticker} BANKRUPT ✅ price dropped ${(dropMagnitude * 100).toFixed(2)}%`;
          } else {
            // WRONG — survived → bet minus % price rose
            userWasRight = false;
            const risePct = Math.max(0, rawChangePct);
            payout = betAmount - (betAmount * risePct);
            resultNote = `${bet.agent_ticker} survived ❌ price +${(risePct * 100).toFixed(2)}%`;
          }
          break;
        }

        default: {
          payout = betAmount; // unknown type — full refund
          resultNote = 'Unknown type — refunded';
        }
      }

      // Payout can never be negative
      payout = Math.max(0, parseFloat(payout.toFixed(6)));
      const profitOrLoss = parseFloat((payout - betAmount).toFixed(6));
      const finalStatus  = userWasRight ? 'won' : 'lost';

      console.log(`  Bet ${bet.id}: ${bet.agent_ticker} "${bet.bet_type}" | ${resultNote} | payout=${payout} ETH`);

      // Send ETH
      let payoutTxHash = null;
      if (wallet && payout > 0) {
        try {
          const tx = await wallet.sendTransaction({
            to:    bet.user_wallet,
            value: ethers.parseEther(payout.toFixed(18)),
          });
          const receipt = await tx.wait();
          payoutTxHash = receipt.hash;
          console.log(`  ✅ Sent ${payout} ETH → ${bet.user_wallet} (${payoutTxHash})`);
        } catch (payErr) {
          console.error(`  ❌ Payout TX failed for bet ${bet.id}:`, payErr.message);
        }
      }

      // Update bet record
      await supabase.from('bets').update({
        status:            finalStatus,
        potential_payout:  payout,
        result_checked_at: new Date().toISOString(),
        resolved_at:       new Date().toISOString(),
        payout_tx_hash:    payoutTxHash,
      }).eq('id', bet.id);

      // Update user_wallets win/loss count
      const { data: walletRow } = await supabase
        .from('user_wallets').select('total_won, total_lost')
        .eq('wallet_address', bet.user_wallet).maybeSingle();
      if (walletRow) {
        await supabase.from('user_wallets').update(
          userWasRight
            ? { total_won:  (walletRow.total_won  || 0) + 1 }
            : { total_lost: (walletRow.total_lost || 0) + 1 }
        ).eq('wallet_address', bet.user_wallet);
      }

      // Activity log
      try {
        const emoji = userWasRight ? '🏆' : '💸';
        await supabase.from('activity').insert({
          agent_ticker: bet.agent_ticker,
          action: `${emoji} Bet resolved: "${BET_TYPES[bet.bet_type]?.label}" — ${resultNote} | Returned ${payout} ETH`,
          amount: payout,
          action_type: userWasRight ? 'bet_won' : 'bet_lost',
        });
      } catch (actErr) { console.error('Activity insert error:', actErr.message); }

      if (io) io.emit('bet-resolved', {
        betId:          bet.id,
        agentTicker:    bet.agent_ticker,
        betType:        bet.bet_type,
        userWasRight,
        priceAtBet,
        currentPrice,
        priceChangePct: parseFloat((rawChangePct * 100).toFixed(2)),
        betAmount,
        payout,
        profitOrLoss,
        userWallet:     bet.user_wallet,
        payoutTxHash,
      });

    } catch (err) {
      console.error(`  Error resolving bet ${bet.id}:`, err.message);
    }
  }

  console.log('🎲 Bet resolution complete');
}

module.exports = { createBetsRouter, resolveBets, BET_TYPES };