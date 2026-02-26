const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const socialService = require('./services/socialService');
const createSocialRouter = require('./routes/social');
const createSettingsRouter = require('./routes/settings');
const createAdminRouter = require('./routes/admin');
const { createBetsRouter, resolveBets } = require('./routes/bets');
const contentCreation = require('./scripts/content-creation');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

socialService.init(supabase, io);
contentCreation.init(process.env.OPENAI_API_KEY);

app.use(cors());
app.use(express.json());
app.use('/api/social', createSocialRouter(supabase, io));
app.use('/api/settings', createSettingsRouter(supabase, io));
app.use('/api/admin', createAdminRouter(supabase, io));
app.use('/api/bets', createBetsRouter(supabase, io));

// ── ROUTES ──

// Get all agents
app.get('/api/agents', async (req, res) => {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .order('price', { ascending: false });
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// Get single agent
app.get('/api/agents/:ticker', async (req, res) => {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('ticker', req.params.ticker)
    .single();
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// Get trades
app.get('/api/trades', async (req, res) => {
  const limit = req.query.limit || 50;
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// Get activity
app.get('/api/activity', async (req, res) => {
  const limit = req.query.limit || 50;
  const { data, error } = await supabase
    .from('activity')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// Get treasury
app.get('/api/treasury', async (req, res) => {
  const { data, error } = await supabase
    .from('treasury')
    .select('*')
    .single();
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// Get price history
app.get('/api/price-history/:ticker', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('price_history')
      .select('*')
      .eq('agent_ticker', req.params.ticker)
      .order('recorded_at', { ascending: true })
      .limit(50);
    if (error) {
      console.error('Price history error for', req.params.ticker, ':', error.message);
      return res.json([]);
    }
    res.json(data || []);
  } catch (err) {
    console.error('Price history exception for', req.params.ticker, ':', err.message);
    res.json([]);
  }
});

// Get tweets
app.get('/api/tweets', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tweets')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) return res.json([]);
    res.json(data);
  } catch (err) {
    res.json([]);
  }
});

// Get user profile
app.get('/api/user/profile/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.params.userId)
      .single();
    if (error) return res.status(404).json({ error: 'Profile not found' });
    res.json(data);
  } catch (err) {
    console.error('Profile fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Check ticker availability
app.get('/api/agents/check-ticker/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase().trim();
    const { data } = await supabase
      .from('agents')
      .select('ticker')
      .eq('ticker', ticker)
      .maybeSingle();
    res.json({ available: !data, ticker });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check ticker' });
  }
});

// Register new agent
app.post('/api/agents/register', async (req, res) => {
  try {
    console.log('Register agent request body:', JSON.stringify(req.body, null, 2));

    const body = req.body;
    const ticker = body.ticker;
    const name = body.name || body.fullName || body.full_name;
    const style = body.personalityStyle || body.style;
    const creatorName = body.creatorName || body.creator_name || null;
    const creatorTwitter = body.creatorTwitter || body.creator_twitter || null;
    const createdBy = body.createdBy || body.created_by || null;
    const avatarUrl = body.avatarUrl || body.avatar_url || null;

    if (!name || !ticker || !style) {
      return res.status(400).json({ error: 'Name, ticker, and personality style are required' });
    }

    const cleanTicker = ticker.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
    const cleanName = name.trim().toUpperCase().replace(/[^A-Z0-9 ]/g, '');

    if (cleanTicker.length < 2 || cleanTicker.length > 6) {
      return res.status(400).json({ error: 'Ticker must be 2-6 characters' });
    }
    if (cleanName.length < 2 || cleanName.length > 12) {
      return res.status(400).json({ error: 'Name must be 2-12 characters' });
    }

    const { data: existing } = await supabase
      .from('agents')
      .select('ticker')
      .eq('ticker', cleanTicker)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: `Ticker ${cleanTicker} is already taken` });
    }

    const fullName = `Agent ${cleanName.charAt(0) + cleanName.slice(1).toLowerCase()}`;

    const insertData = {
      ticker: cleanTicker,
      full_name: fullName,
      style: style,
      price: 1.00,
      wallet: 10.00,
      tasks_completed: 0,
      tasks_failed: 0,
      total_earned: 0,
      shares_owned: {},
      status: 'pending_approval',
      cycle_count: 0,
      created_by: createdBy,
      creator_name: creatorName,
      creator_twitter: creatorTwitter,
      avatar_url: avatarUrl
    };

    console.log('Agent insert data:', JSON.stringify(insertData, null, 2));

    const { data: agent, error } = await supabase
      .from('agents')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Agent insert error:', error);
      return res.status(500).json({ error: error.message || 'Failed to create agent' });
    }

    await supabase.from('price_history').insert({
      agent_ticker: cleanTicker,
      price: 1.0000
    });

    await supabase.from('activity').insert({
      agent_ticker: cleanTicker,
      action: `📝 NEW AGENT ${cleanTicker} submitted for approval`,
      amount: 10.00,
      action_type: 'registration'
    });

    io.emit('agent-registered', { agent });

    res.json(agent);
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Get market stats
app.get('/api/stats', async (req, res) => {
  try {
    const { data: agents } = await supabase.from('agents').select('*');
    const { data: treasury } = await supabase.from('treasury').select('*').single();
    const { data: trades } = await supabase.from('trades').select('id');

    if (!agents || !agents.length) {
      return res.json({
        avgPrice: '1.0000', topAgent: null, riskAgent: null,
        totalAgents: 0, activeAgents: 0, bankruptAgents: 0,
        treasury: treasury || null, totalTrades: trades?.length || 0
      });
    }

    const prices = agents.map(a => parseFloat(a.price));
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const topAgent = [...agents].sort((a, b) => b.price - a.price)[0];
    const riskAgent = agents
      .filter(a => a.status === 'active')
      .sort((a, b) => a.wallet - b.wallet)[0];

    res.json({
      avgPrice: avgPrice.toFixed(4),
      topAgent: topAgent?.ticker,
      riskAgent: riskAgent?.ticker,
      totalAgents: agents.length,
      activeAgents: agents.filter(a => a.status === 'active').length,
      bankruptAgents: agents.filter(a => a.status === 'bankrupt').length,
      treasury,
      totalTrades: trades?.length || 0
    });
  } catch (err) {
    res.json({
      avgPrice: '1.0000', topAgent: null, riskAgent: null,
      totalAgents: 0, activeAgents: 0, bankruptAgents: 0,
      treasury: null, totalTrades: 0
    });
  }
});

// ── EXCHANGE ENGINE ──

const STYLE_CONFIG = {
  'careful and analytical':    { successRate: 0.80, earnRange: [0.50, 2.00], attempts: 1 },
  'aggressive risk-taker':     { successRate: 0.55, earnRange: [0.50, 4.00], attempts: 1 },
  'creative and unpredictable':{ successRate: 0.60, earnRange: [0.50, 5.00], attempts: 1 },
  'fast executor':             { successRate: 0.70, earnRange: [0.30, 1.50], attempts: 2 },
  'pure investor':             { successRate: 0,    earnRange: [0, 0],       attempts: 0 },
};
const DEFAULT_CONFIG = { successRate: 0.65, earnRange: [0.50, 2.00], attempts: 1 };

async function getSettings() {
  try {
    const { data } = await supabase.from('settings').select('*').eq('id', 1).single();
    return data || {
      exchange_cycle_interval: 10, task_cycle_interval: 15, trade_fee: 2,
      bankruptcy_threshold: 0.10, dominant_multiplier: 1.5,
      allow_agent_suggestions: true, dashboard_refresh_rate: 30
    };
  } catch {
    return {
      exchange_cycle_interval: 10, task_cycle_interval: 15, trade_fee: 2,
      bankruptcy_threshold: 0.10, dominant_multiplier: 1.5,
      allow_agent_suggestions: true, dashboard_refresh_rate: 30
    };
  }
}

async function runExchangeCycle() {
  console.log('⚡ Running exchange cycle...');

  const settings = await getSettings();

  const { data: agents, error: agentErr } = await supabase
    .from('agents')
    .select('*')
    .in('status', ['active', 'dominant']);

  if (agentErr || !agents?.length) {
    console.log('⚠️  No active agents found, skipping cycle');
    return;
  }

  const { data: treasury } = await supabase
    .from('treasury')
    .select('*')
    .single();

  if (!treasury) {
    console.log('⚠️  No treasury found, skipping cycle');
    return;
  }

  const tradeFeeRate = parseFloat(settings.trade_fee) / 100;
  const bankruptcyThreshold = parseFloat(settings.bankruptcy_threshold);
  const dominantMultiplier = parseFloat(settings.dominant_multiplier);
  const noiseFactor = 0.06;

  let totalFees = 0;
  let totalTrades = 0;
  let totalTaskAgents = 0;
  const bankruptedThisCycle = new Set();

  for (const agent of agents) {
    const config = STYLE_CONFIG[agent.style] || DEFAULT_CONFIG;
    const isInvestor = config.attempts === 0;
    let wallet = parseFloat(agent.wallet);
    let tasksWon = 0;
    let tasksLost = 0;
    let earnedThisCycle = 0;

    // ── TASK SIMULATION ──
    if (!isInvestor) {
      totalTaskAgents++;

      for (let i = 0; i < config.attempts; i++) {
        const success = Math.random() < config.successRate;
        const [min, max] = config.earnRange;
        const earned = success ? parseFloat((Math.random() * (max - min) + min).toFixed(2)) : 0;

        tasksWon += success ? 1 : 0;
        tasksLost += success ? 0 : 1;
        earnedThisCycle += earned;
        wallet += earned;

        await supabase.from('activity').insert({
          agent_ticker: agent.ticker,
          action: success ? `completed task, earned $${earned}` : 'failed a task 💀',
          amount: earned,
          action_type: 'task'
        });

        socialService.maybePostEvent(
          agent, success ? 'TASK_WIN' : 'TASK_FAIL',
          { earned, wallet: wallet.toFixed(2) }, agents
        );
      }

      await supabase.from('agents').update({
        tasks_completed: agent.tasks_completed + tasksWon,
        tasks_failed: agent.tasks_failed + tasksLost,
        total_earned: parseFloat(agent.total_earned) + earnedThisCycle,
        wallet,
        updated_at: new Date()
      }).eq('ticker', agent.ticker);
    }

    // ── PRICE CALCULATION ──
    const completedTotal = agent.tasks_completed + tasksWon;
    const failedTotal = agent.tasks_failed + tasksLost;
    const successRate = completedTotal / Math.max(completedTotal + failedTotal, 1);
    const perfFactor = (successRate - 0.5) * 0.20;
    const noise = (Math.random() - 0.5) * noiseFactor;
    const oldPrice = parseFloat(agent.price);
    const newPrice = Math.max(0.01,
      parseFloat((oldPrice * (1 + perfFactor + noise)).toFixed(4))
    );

    await supabase.from('agents')
      .update({ price: newPrice, updated_at: new Date() })
      .eq('ticker', agent.ticker);

    await supabase.from('price_history').insert({
      agent_ticker: agent.ticker,
      price: newPrice
    });

    const priceDrop = ((oldPrice - newPrice) / oldPrice) * 100;
    if (priceDrop > 10) {
      socialService.maybePostEvent(agent, 'PRICE_DROP', {
        dropPercent: priceDrop.toFixed(1), newPrice: newPrice.toFixed(4), oldPrice: oldPrice.toFixed(4)
      }, agents);
    }

    const allPrices = agents.map(a => parseFloat(a.price));
    const avgPrice = allPrices.reduce((a, b) => a + b, 0) / allPrices.length;
    if (newPrice > avgPrice * dominantMultiplier) {
      socialService.maybePostEvent(agent, 'DOMINANCE', {
        ratio: (newPrice / avgPrice).toFixed(2)
      }, agents);
    }

    // ── TRADE SIMULATION ──
    const eligibleTargets = agents.filter(a =>
      a.ticker !== agent.ticker && !bankruptedThisCycle.has(a.ticker)
    );

    if (wallet > 2 && eligibleTargets.length > 0) {
      const target = [...eligibleTargets].sort((a, b) =>
        (b.tasks_completed / Math.max(b.tasks_completed + b.tasks_failed, 1)) -
        (a.tasks_completed / Math.max(a.tasks_completed + a.tasks_failed, 1))
      )[0];

      const targetSuccessRate = target.tasks_completed /
        Math.max(target.tasks_completed + target.tasks_failed, 1);

      if (targetSuccessRate > 0.6 || isInvestor) {
        const shares = Math.floor(Math.random() * 3) + 1;
        const cost = shares * parseFloat(target.price);
        const fee = parseFloat((cost * tradeFeeRate).toFixed(4));
        const total = cost + fee;

        if (wallet >= total) {
          wallet -= total;

          await supabase.from('trades').insert({
            buyer_ticker: agent.ticker,
            seller_ticker: target.ticker,
            shares,
            price_at_trade: target.price,
            total_cost: cost,
            fee
          });

          await supabase.from('activity').insert({
            agent_ticker: agent.ticker,
            action: `bought ${shares} shares of ${target.ticker} @ $${target.price}`,
            amount: cost,
            action_type: 'trade'
          });

          await supabase.from('agents')
            .update({ wallet })
            .eq('ticker', agent.ticker);

          socialService.maybePostEvent(agent, 'TRADE', {
            shares, target: target.ticker, price: target.price, cost: cost.toFixed(4)
          }, agents);

          totalFees += fee;
          totalTrades++;
        }
      }
    }

    // ── BANKRUPTCY CHECK ──
    if (wallet < bankruptcyThreshold) {
      bankruptedThisCycle.add(agent.ticker);

      await supabase.from('agents')
        .update({
          status: 'bankrupt',
          wallet,
          final_price: newPrice,
          bankrupt_at: new Date().toISOString(),
          updated_at: new Date()
        })
        .eq('ticker', agent.ticker);

      await supabase.from('activity').insert({
        agent_ticker: agent.ticker,
        action: `💀 WENT BANKRUPT at $${newPrice.toFixed(4)} — delisted from exchange`,
        amount: 0,
        action_type: 'bankruptcy'
      });

      socialService.maybePostEvent(agent, 'BANKRUPTCY', {
        finalPrice: newPrice.toFixed(4), finalWallet: wallet.toFixed(4)
      }, agents);

      console.log(`  💀 ${agent.ticker} went bankrupt (wallet: $${wallet.toFixed(4)}, price: $${newPrice.toFixed(4)})`);
      continue;
    }

    // ── CYCLE TRACKING ──
    const newCycleCount = (agent.cycle_count || 0) + 1;
    await supabase.from('agents').update({
      last_cycle_at: new Date().toISOString(),
      cycle_count: newCycleCount,
      updated_at: new Date()
    }).eq('ticker', agent.ticker);

    // ── AGENT SUGGESTIONS (every 5 cycles, 20% chance) ──
    if (newCycleCount > 0 && newCycleCount % 5 === 0) {
      socialService.maybeGenerateSuggestion(
        { ...agent, cycle_count: newCycleCount }, settings, agents
      ).catch(console.error);
    }
  }

  // ── UPDATE TREASURY ──
  await supabase.from('treasury').update({
    total_fees: parseFloat(treasury.total_fees) + totalFees,
    total_trades: treasury.total_trades + totalTrades,
    total_tasks: treasury.total_tasks + totalTaskAgents,
    exchange_wallet: parseFloat(treasury.exchange_wallet) + totalFees,
    updated_at: new Date()
  }).eq('id', treasury.id);

  // ── EMIT REAL-TIME UPDATES ──
  const { data: updatedAgents } = await supabase
    .from('agents').select('*').order('price', { ascending: false });
  const { data: updatedTreasury } = await supabase
    .from('treasury').select('*').single();

  io.emit('exchange-update', {
    agents: updatedAgents,
    treasury: updatedTreasury,
    timestamp: new Date()
  });

  socialService.generateScheduledPosts(updatedAgents).catch(console.error);

  console.log(`✅ Cycle complete — ${agents.length} agents, ${bankruptedThisCycle.size} bankrupt, Fees: $${totalFees.toFixed(4)}, Trades: ${totalTrades}`);

  contentCreation.runContentCycle(supabase, io).catch(err => {
    console.error('Content creation cycle error:', err.message);
  });
}

// Run exchange every 10 minutes
cron.schedule('*/10 * * * *', runExchangeCycle);

// Resolve expired bets every 10 minutes
cron.schedule('*/10 * * * *', () => {
  resolveBets(supabase, io).catch(err => console.error('Bet resolution error:', err.message));
});

// WebSocket connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Axionet API running on port ${PORT}`);
  console.log(`⚡ Exchange engine armed — firing every 10 minutes`);
});
