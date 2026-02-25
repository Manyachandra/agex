const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');

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

app.use(cors());
app.use(express.json());

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
  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .eq('agent_ticker', req.params.ticker)
    .order('recorded_at', { ascending: true })
    .limit(50);
  if (error) return res.status(500).json({ error });
  res.json(data);
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
      .filter(a => a.status === 'ACTIVE')
      .sort((a, b) => a.wallet - b.wallet)[0];

    res.json({
      avgPrice: avgPrice.toFixed(4),
      topAgent: topAgent?.ticker,
      riskAgent: riskAgent?.ticker,
      totalAgents: agents.length,
      activeAgents: agents.filter(a => a.status === 'ACTIVE').length,
      bankruptAgents: agents.filter(a => a.status === 'BANKRUPT').length,
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
async function runExchangeCycle() {
  console.log('⚡ Running exchange cycle...');

  const { data: agents } = await supabase
    .from('agents')
    .select('*')
    .eq('status', 'ACTIVE');

  const { data: treasury } = await supabase
    .from('treasury')
    .select('*')
    .single();

  let totalFees = 0;
  let totalTrades = 0;

  for (const agent of agents) {
    // Task simulation
    if (agent.ticker !== 'BRAHMA') {
      const successRates = {
        'ZEUS': 0.55, 'RAVI': 0.80,
        'NOVA': 0.60, 'KIRA': 0.70
      };
      const earnRanges = {
        'ZEUS': [0.50, 4.00], 'RAVI': [0.50, 2.00],
        'NOVA': [0.50, 5.00], 'KIRA': [0.30, 1.50]
      };

      const attempts = agent.ticker === 'KIRA' ? 2 : 1;

      for (let i = 0; i < attempts; i++) {
        const success = Math.random() < (successRates[agent.ticker] || 0.65);
        const [min, max] = earnRanges[agent.ticker] || [0.5, 2.0];
        const earned = success ? parseFloat((Math.random() * (max - min) + min).toFixed(2)) : 0;

        await supabase.from('agents').update({
          tasks_completed: agent.tasks_completed + (success ? 1 : 0),
          tasks_failed: agent.tasks_failed + (success ? 0 : 1),
          total_earned: parseFloat(agent.total_earned) + earned,
          wallet: parseFloat(agent.wallet) + earned,
          updated_at: new Date()
        }).eq('ticker', agent.ticker);

        await supabase.from('activity').insert({
          agent_ticker: agent.ticker,
          action: success ? `completed task, earned $${earned}` : 'failed a task 💀',
          amount: earned,
          action_type: 'task'
        });
      }
    }

    // Price calculation
    const successRate = (agent.tasks_completed) /
      Math.max(agent.tasks_completed + agent.tasks_failed, 1);
    const perfFactor = (successRate - 0.5) * 0.20;
    const noise = (Math.random() - 0.5) * 0.06;
    const newPrice = Math.max(0.01,
      parseFloat((parseFloat(agent.price) * (1 + perfFactor + noise)).toFixed(4))
    );

    await supabase.from('agents')
      .update({ price: newPrice, updated_at: new Date() })
      .eq('ticker', agent.ticker);

    // Record price history
    await supabase.from('price_history').insert({
      agent_ticker: agent.ticker,
      price: newPrice
    });

    // Trade simulation
    const otherAgents = agents.filter(a => a.ticker !== agent.ticker);
    if (parseFloat(agent.wallet) > 2 && otherAgents.length > 0) {
      const target = otherAgents.sort((a, b) =>
        (b.tasks_completed / Math.max(b.tasks_completed + b.tasks_failed, 1)) -
        (a.tasks_completed / Math.max(a.tasks_completed + a.tasks_failed, 1))
      )[0];

      const targetSuccessRate = target.tasks_completed /
        Math.max(target.tasks_completed + target.tasks_failed, 1);

      if (targetSuccessRate > 0.6 || agent.ticker === 'BRAHMA') {
        const shares = Math.floor(Math.random() * 3) + 1;
        const cost = shares * parseFloat(target.price);
        const fee = parseFloat((cost * 0.02).toFixed(4));
        const total = cost + fee;

        if (parseFloat(agent.wallet) >= total) {
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
            .update({ wallet: parseFloat(agent.wallet) - total })
            .eq('ticker', agent.ticker);

          totalFees += fee;
          totalTrades++;
        }
      }
    }

    // Bankruptcy check
    if (parseFloat(agent.wallet) < 0.10) {
      await supabase.from('agents')
        .update({ status: 'BANKRUPT' })
        .eq('ticker', agent.ticker);

      await supabase.from('activity').insert({
        agent_ticker: agent.ticker,
        action: '💀 WENT BANKRUPT — delisted from exchange',
        amount: 0,
        action_type: 'bankruptcy'
      });
    }
  }

  // Update treasury
  await supabase.from('treasury').update({
    total_fees: parseFloat(treasury.total_fees) + totalFees,
    total_trades: treasury.total_trades + totalTrades,
    total_tasks: treasury.total_tasks + agents.filter(a => a.ticker !== 'BRAHMA').length,
    exchange_wallet: parseFloat(treasury.exchange_wallet) + totalFees,
    updated_at: new Date()
  }).eq('id', treasury.id);

  // Emit real-time update to all connected clients
  const { data: updatedAgents } = await supabase
    .from('agents').select('*').order('price', { ascending: false });
  const { data: updatedTreasury } = await supabase
    .from('treasury').select('*').single();

  io.emit('exchange-update', {
    agents: updatedAgents,
    treasury: updatedTreasury,
    timestamp: new Date()
  });

  console.log(`✅ Cycle complete. Fees: $${totalFees.toFixed(4)}, Trades: ${totalTrades}`);
}

// Run exchange every 10 minutes
cron.schedule('*/10 * * * *', runExchangeCycle);

// WebSocket connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Agent Economy API running on port ${PORT}`);
  console.log(`⚡ Exchange engine armed — firing every 10 minutes`);
});
