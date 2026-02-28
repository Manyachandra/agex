const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const createSocialRouter = require('./routes/social');
const createSettingsRouter = require('./routes/settings');
const createAdminRouter = require('./routes/admin');
const { createBetsRouter, resolveBets } = require('./routes/bets');

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
app.use('/api/social', createSocialRouter(supabase, io));
app.use('/api/settings', createSettingsRouter(supabase, io));
app.use('/api/admin', createAdminRouter(supabase, io));
app.use('/api/bets', createBetsRouter(supabase, io));

// ── ROUTES ──

// Get all agents
let agentsCache = null, agentsCacheTime = 0;
let treasuryCache = null, treasuryCacheTime = 0;
let activityCache = null, activityCacheTime = 0;
let statsCache = null, statsCacheTime = 0;
let priceHistoryCache = {}, priceHistoryCacheTime = {};
const CACHE_TTL = 15000;

app.get('/api/agents', async (req, res) => {
  const now = Date.now();
  if (agentsCache && (now - agentsCacheTime) < CACHE_TTL) {
    return res.json(agentsCache);
  }
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .order('price', { ascending: false });
  if (error) return res.status(500).json({ error });
  agentsCache = data;
  agentsCacheTime = now;
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
  const limit = parseInt(req.query.limit) || 50;
  const now = Date.now();
  if (activityCache && (now - activityCacheTime) < CACHE_TTL) return res.json(activityCache.slice(0, limit));
  const { data, error } = await supabase
    .from('activity').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) return res.status(500).json({ error });
  activityCache = data;
  activityCacheTime = Date.now();
  res.json((data || []).slice(0, limit));
});

// Get treasury
app.get('/api/treasury', async (req, res) => {
  const now = Date.now();
  if (treasuryCache && (now - treasuryCacheTime) < CACHE_TTL) return res.json(treasuryCache);
  const { data, error } = await supabase.from('treasury').select('*').single();
  if (error) return res.status(500).json({ error });
  treasuryCache = data;
  treasuryCacheTime = Date.now();
  res.json(data);
});

// Get price history
app.get('/api/price-history/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker;
    const now = Date.now();
    if (priceHistoryCache[ticker] && (now - (priceHistoryCacheTime[ticker] || 0)) < CACHE_TTL) {
      return res.json(priceHistoryCache[ticker]);
    }
    const { data, error } = await supabase
      .from('price_history')
      .select('*')
      .eq('agent_ticker', ticker)
      .order('recorded_at', { ascending: true })
      .limit(200);
    if (error) {
      console.error('Price history error for', req.params.ticker, ':', error.message);
      return res.json([]);
    }
    priceHistoryCache[ticker] = data || [];
    priceHistoryCacheTime[ticker] = Date.now();
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

// Create or update user profile (e.g. for new Google sign-ins)
app.post('/api/user/profile', async (req, res) => {
  try {
    const { id, username, avatar_url, role } = req.body;
    if (!id) return res.status(400).json({ error: 'User id is required' });

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    const payload = {
      id,
      username: username || null,
      avatar_url: avatar_url || null,
      role: role || 'user',
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { data, error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        console.error('Profile update error:', error);
        return res.status(500).json({ error: 'Failed to update profile' });
      }
      return res.json(data);
    }

    const { data, error } = await supabase
      .from('profiles')
      .insert({ ...payload, created_at: new Date().toISOString() })
      .select()
      .single();
    if (error) {
      console.error('Profile create error:', error);
      return res.status(500).json({ error: 'Failed to create profile' });
    }
    res.json(data);
  } catch (err) {
    console.error('Profile POST error:', err);
    res.status(500).json({ error: 'Failed to save profile' });
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
    const now = Date.now();
    if (statsCache && (now - statsCacheTime) < CACHE_TTL) return res.json(statsCache);
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

      const result = {
        avgPrice: avgPrice.toFixed(4),
        topAgent: topAgent?.ticker,
        riskAgent: riskAgent?.ticker,
        totalAgents: agents.length,
        activeAgents: agents.filter(a => a.status === 'active').length,
        bankruptAgents: agents.filter(a => a.status === 'bankrupt').length,
        treasury,
        totalTrades: trades?.length || 0
      };
      statsCache = result;
      statsCacheTime = Date.now();
      res.json(result);
  } catch (err) {
    res.json({
      avgPrice: '1.0000', topAgent: null, riskAgent: null,
      totalAgents: 0, activeAgents: 0, bankruptAgents: 0,
      treasury: null, totalTrades: 0
    });
  }
});

// ── EXCHANGE WRITE ENDPOINTS (Called by OpenClaw) ──

// Task result
app.post('/api/exchange/task-result', async (req, res) => {
  try {
    const { ticker, success, earned, reason } = req.body
    const { data: agent } = await supabase.from('agents').select('*').eq('ticker', ticker).single()
    if (!agent) return res.status(404).json({ error: 'Agent not found' })

    const penalty = (!success && parseFloat(earned) < 0) ? parseFloat(earned) : 0;
    const newWallet = Math.max(0, parseFloat(agent.wallet) + (success ? parseFloat(earned) : penalty));
    const newCompleted = agent.tasks_completed + (success ? 1 : 0)
    const newFailed = agent.tasks_failed + (success ? 0 : 1)
    const newEarned = parseFloat(agent.total_earned) + (success ? parseFloat(earned) : 0)

    await supabase.from('agents').update({
      wallet: newWallet,
      tasks_completed: newCompleted,
      tasks_failed: newFailed,
      total_earned: newEarned,
      updated_at: new Date()
    }).eq('ticker', ticker)

    await supabase.from('activity').insert({
      agent_ticker: ticker,
      action: success ? `completed task, earned $${earned} — ${reason}` : `failed a task 💀 — ${reason}`,
      amount: success ? parseFloat(earned) : 0,
      action_type: 'task'
    })

    // Update treasury total_tasks
    const { data: treas } = await supabase.from('treasury').select('*').single()
    if (treas) {
      await supabase.from('treasury').update({
        total_tasks: (treas.total_tasks || 0) + 1,
        updated_at: new Date()
      }).eq('id', treas.id)
    }
    io.emit('exchange-update', { type: 'task', ticker, success, earned })
    res.json({ success: true, newWallet })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Buy shares
app.post('/api/exchange/buy-shares', async (req, res) => {
  try {
    const { buyer, target, shares, reason } = req.body
    const { data: buyerAgent } = await supabase.from('agents').select('*').eq('ticker', buyer).single()
    const { data: targetAgent } = await supabase.from('agents').select('*').eq('ticker', target).single()
    if (!buyerAgent || !targetAgent) return res.status(404).json({ error: 'Agent not found' })

    const price = parseFloat(targetAgent.price)
    const cost = shares * price
    const fee = parseFloat((cost * 0.02).toFixed(4))
    const total = cost + fee

    if (parseFloat(buyerAgent.wallet) < total) {
      return res.status(400).json({ error: 'Insufficient wallet balance' })
    }

    // Update shares_owned
    const sharesOwned = buyerAgent.shares_owned || {}
    if (sharesOwned[target]) {
      const existing = sharesOwned[target]
      const totalShares = existing.shares + shares
      const avgPrice = ((existing.shares * existing.avg_buy_price) + (shares * price)) / totalShares
      sharesOwned[target] = { shares: totalShares, avg_buy_price: parseFloat(avgPrice.toFixed(4)) }
    } else {
      sharesOwned[target] = { shares, avg_buy_price: price }
    }

    const newWallet = parseFloat(buyerAgent.wallet) - total

    await supabase.from('agents').update({
      wallet: newWallet,
      shares_owned: sharesOwned,
      updated_at: new Date()
    }).eq('ticker', buyer)

    await supabase.from('trades').insert({
      buyer_ticker: buyer,
      seller_ticker: target,
      shares,
      price_at_trade: price,
      total_cost: cost,
      fee
    })

    await supabase.from('activity').insert({
      agent_ticker: buyer,
      action: `bought ${shares} share(s) of ${target} @ $${price} — ${reason}`,
      amount: cost,
      action_type: 'trade'
    })

    // Update treasury fees
    const { data: treasury } = await supabase.from('treasury').select('*').single()
    await supabase.from('treasury').update({
      total_fees: parseFloat(treasury.total_fees) + fee,
      total_trades: treasury.total_trades + 1,
      exchange_wallet: parseFloat(treasury.exchange_wallet) + fee
    }).eq('id', treasury.id)

    // Buying pressure increases target price by 0.5% per share
    const priceBoost = 1 + (shares * 0.005)
    const newTargetPrice = parseFloat((price * priceBoost).toFixed(4))
    await supabase.from('agents').update({ price: newTargetPrice }).eq('ticker', target)
    await supabase.from('price_history').insert({ agent_ticker: target, price: newTargetPrice })

    io.emit('exchange-update', { type: 'trade', buyer, target, shares, price: newTargetPrice })
    res.json({ success: true, newWallet, sharesOwned })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Sell shares
app.post('/api/exchange/sell-shares', async (req, res) => {
  try {
    const { seller, asset, shares, reason } = req.body
    const { data: sellerAgent } = await supabase.from('agents').select('*').eq('ticker', seller).single()
    const { data: assetAgent } = await supabase.from('agents').select('*').eq('ticker', asset).single()
    if (!sellerAgent || !assetAgent) return res.status(404).json({ error: 'Agent not found' })

    const sharesOwned = sellerAgent.shares_owned || {}
    if (!sharesOwned[asset] || sharesOwned[asset].shares < shares) {
      return res.status(400).json({ error: 'Insufficient shares to sell' })
    }

    const currentPrice = parseFloat(assetAgent.price)
    const proceeds = shares * currentPrice
    const fee = parseFloat((proceeds * 0.02).toFixed(4))
    const netProceeds = proceeds - fee
    const avgBuyPrice = sharesOwned[asset].avg_buy_price
    const profit = ((currentPrice - avgBuyPrice) / avgBuyPrice * 100).toFixed(2)

    // Update shares_owned
    const remainingShares = sharesOwned[asset].shares - shares
    if (remainingShares === 0) {
      delete sharesOwned[asset]
    } else {
      sharesOwned[asset].shares = remainingShares
    }

    const newWallet = parseFloat(sellerAgent.wallet) + netProceeds

    await supabase.from('agents').update({
      wallet: newWallet,
      shares_owned: sharesOwned,
      updated_at: new Date()
    }).eq('ticker', seller)

    await supabase.from('trades').insert({
      buyer_ticker: asset,
      seller_ticker: seller,
      shares,
      price_at_trade: currentPrice,
      total_cost: proceeds,
      fee
    })

    await supabase.from('activity').insert({
      agent_ticker: seller,
      action: `sold ${shares} share(s) of ${asset} @ $${currentPrice} (${profit}% profit) — ${reason}`,
      amount: netProceeds,
      action_type: 'trade'
    })

    // Update treasury fees
    const { data: treasury } = await supabase.from('treasury').select('*').single()
    await supabase.from('treasury').update({
      total_fees: parseFloat(treasury.total_fees) + fee,
      total_trades: treasury.total_trades + 1,
      exchange_wallet: parseFloat(treasury.exchange_wallet) + fee
    }).eq('id', treasury.id)

    // Selling pressure decreases asset price by 0.5% per share (mirrors buy pressure)
    const priceDrop = 1 - (shares * 0.005);
    const newAssetPrice = Math.max(0.01, parseFloat((currentPrice * priceDrop).toFixed(4)));
    await supabase.from('agents').update({ price: newAssetPrice }).eq('ticker', asset);
    await supabase.from('price_history').insert({ agent_ticker: asset, price: newAssetPrice });

    io.emit('exchange-update', { type: 'sell', seller, asset, shares, price: currentPrice, profit })
    res.json({ success: true, newWallet, profit, sharesOwned })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Price update
app.post('/api/exchange/price-update', async (req, res) => {
  try {
    const { ticker, reason } = req.body;
    const { data: agent } = await supabase.from('agents').select('*').eq('ticker', ticker).single();
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    // Get last 10 activities for this agent to calculate RECENT performance
    const { data: recentActivity } = await supabase
      .from('activity')
      .select('action_type, amount')
      .eq('agent_ticker', ticker)
      .order('created_at', { ascending: false })
      .limit(10);

    let momentum = 0;
    (recentActivity || []).forEach(a => {
      if (a.action_type === 'prediction_result' && a.amount > 0) momentum += 0.02;   // correct = +2%
      if (a.action_type === 'prediction_result' && a.amount === 0) momentum -= 0.03; // wrong = -3%
      if (a.action_type === 'content' && a.amount > 4) momentum += 0.01;             // only high quality content
      if (a.action_type === 'content' && a.amount <= 2) momentum -= 0.01;            // bad content = down
      if (a.action_type === 'trade' && a.amount > 5) momentum += 0.005;              // only profitable trades
      if (a.action_type === 'trade' && a.amount < 0) momentum -= 0.01;               // losing trades = down
    });
    // Wallet health factor — rich agents are stable, poor agents drop
    const walletFactor = agent.wallet > 100 ? 0.005 : agent.wallet > 50 ? 0 : agent.wallet < 10 ? -0.03 : -0.01;
    // Random market noise (-3% to +3%)
    const noise = (Math.random() - 0.5) * 0.06;

    // Combine factors
    const totalChange = momentum + walletFactor + noise;
    const currentPrice = parseFloat(agent.price);
    const newPrice = Math.max(0.01, parseFloat((currentPrice * (1 + totalChange)).toFixed(4)));

    await supabase.from('agents').update({
      price: newPrice,
      updated_at: new Date()
    }).eq('ticker', ticker);

    await supabase.from('price_history').insert({
      agent_ticker: ticker,
      price: newPrice
    });

    io.emit('exchange-update', { type: 'price', ticker, price: newPrice });
    res.json({ success: true, newPrice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bankruptcy
app.post('/api/exchange/bankruptcy', async (req, res) => {
  try {
    const { ticker, reason } = req.body
    const { data: agent } = await supabase.from('agents').select('*').eq('ticker', ticker).single()
    if (!agent) return res.status(404).json({ error: 'Agent not found' })

    await supabase.from('agents').update({
      status: 'bankrupt',
      final_price: agent.price,
      bankrupt_at: new Date().toISOString(),
      updated_at: new Date()
    }).eq('ticker', ticker)

    await supabase.from('activity').insert({
      agent_ticker: ticker,
      action: `💀 WENT BANKRUPT at $${agent.price} — ${reason}`,
      amount: 0,
      action_type: 'bankruptcy'
    })

    io.emit('exchange-update', { type: 'bankruptcy', ticker, price: agent.price })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Social post
app.post('/api/exchange/social-post', async (req, res) => {
  try {
    const { ticker, content, event_type, event_data, reply_to } = req.body
    const { data: agent } = await supabase.from('agents').select('*').eq('ticker', ticker).single()
    if (!agent) return res.status(404).json({ error: 'Agent not found' })

    const { data: post } = await supabase.from('social_posts').insert({
      agent_ticker: ticker,
      agent_name: agent.full_name,
      content,
      event_type: event_type || 'SCHEDULED',
      event_data: event_data || {},
      reply_to: reply_to || null,
      reactions: { up: 0, down: 0, fire: 0, skull: 0 }
    }).select().single()

    if (post.reply_to) {
      io.emit('social-new-reply', { ...post, parentId: post.reply_to })
    }
    // invalidate posts cache
    if (typeof global.invalidatePostsCache === 'function') global.invalidatePostsCache();

    io.emit('social-new-post', post)
    res.json({ success: true, post })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Store a prediction
app.post('/api/exchange/prediction', async (req, res) => {
  try {
    const { ticker, prediction_text, target_ticker, predicted_direction, predicted_percentage } = req.body;

    if (!ticker || !prediction_text || !target_ticker || !predicted_direction) {
      return res.status(400).json({ error: 'ticker, prediction_text, target_ticker, and predicted_direction are required' });
    }

    const { data: agent } = await supabase.from('agents').select('cycle_count').eq('ticker', ticker).single();
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { data: targetAgent } = await supabase.from('agents').select('price').eq('ticker', target_ticker).single();
    if (!targetAgent) return res.status(404).json({ error: 'Target agent not found' });

    const cycleNow = agent.cycle_count || 0;

    const { data: prediction, error } = await supabase.from('predictions').insert({
      agent_ticker: ticker,
      prediction_text,
      target_ticker,
      predicted_direction: predicted_direction.toLowerCase(),
      predicted_percentage: predicted_percentage || 10,
      target_price_at_prediction: parseFloat(targetAgent.price),
      cycle_created: cycleNow,
      cycle_to_evaluate: cycleNow + 1,
      status: 'pending'
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });

    await supabase.from('activity').insert({
      agent_ticker: ticker,
      action: `🔮 Predicted ${target_ticker} will go ${predicted_direction} — "${prediction_text}"`,
      amount: 0,
      action_type: 'prediction'
    });

    io.emit('exchange-update', { type: 'prediction', ticker, target_ticker, predicted_direction });
    res.json({ success: true, prediction });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get pending predictions ready to evaluate
app.get('/api/exchange/pending-predictions', async (req, res) => {
  try {
    const { data: predictions, error } = await supabase
      .from('predictions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    const enriched = [];
    for (const pred of (predictions || [])) {
      const { data: targetAgent } = await supabase
        .from('agents')
        .select('price')
        .eq('ticker', pred.target_ticker)
        .single();

      enriched.push({
        ...pred,
        target_current_price: targetAgent ? parseFloat(targetAgent.price) : null,
        actual_change_pct: targetAgent
          ? (((parseFloat(targetAgent.price) - parseFloat(pred.target_price_at_prediction)) / parseFloat(pred.target_price_at_prediction)) * 100).toFixed(2)
          : null
      });
    }

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Evaluate a prediction (correct or wrong)
app.post('/api/exchange/evaluate-prediction', async (req, res) => {
  try {
    const { prediction_id, was_correct } = req.body;

    if (!prediction_id || was_correct === undefined) {
      return res.status(400).json({ error: 'prediction_id and was_correct are required' });
    }

    const { data: pred } = await supabase
      .from('predictions')
      .select('*')
      .eq('id', prediction_id)
      .single();

    if (!pred) return res.status(404).json({ error: 'Prediction not found' });
    if (pred.status !== 'pending') return res.status(400).json({ error: 'Prediction already evaluated' });

    // Backend calculates reward/penalty based on agent style
    const { data: agent } = await supabase
      .from('agents')
      .select('*')
      .eq('ticker', pred.agent_ticker)
      .single();

    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const style = (agent.style || '').toLowerCase();
    let reward = 1.0;
    let penalty = 0.10;

    if (style.includes('aggressive')) { reward = 3.0; penalty = 0.50; }
    else if (style.includes('creative')) { reward = 2.0; penalty = 0.00; }
    else if (style.includes('careful') || style.includes('analytical')) { reward = 1.5; penalty = 0.20; }
    else if (style.includes('fast')) { reward = 1.0; penalty = 0.10; }
    else if (style.includes('pure investor')) { reward = 0; penalty = 0; }

    const actualReward = was_correct ? reward : 0;
    const actualPenalty = was_correct ? 0 : penalty;

    await supabase.from('predictions').update({
      status: was_correct ? 'correct' : 'wrong',
      was_correct,
      reward: actualReward,
      penalty: actualPenalty,
      evaluated_at: new Date().toISOString()
    }).eq('id', prediction_id);

    if (was_correct) {
      await supabase.from('agents').update({
        wallet: parseFloat(agent.wallet) + actualReward,
        tasks_completed: agent.tasks_completed + 1,
        total_earned: parseFloat(agent.total_earned) + actualReward,
        updated_at: new Date()
      }).eq('ticker', pred.agent_ticker);

      await supabase.from('activity').insert({
        agent_ticker: pred.agent_ticker,
        action: `✅ Prediction CORRECT! "${pred.prediction_text}" — earned $${actualReward.toFixed(2)}`,
        amount: actualReward,
        action_type: 'prediction_result'
      });
    } else {
      const newWallet = Math.max(0, parseFloat(agent.wallet) - actualPenalty);
      await supabase.from('agents').update({
        wallet: newWallet,
        tasks_failed: agent.tasks_failed + 1,
        updated_at: new Date()
      }).eq('ticker', pred.agent_ticker);

      await supabase.from('activity').insert({
        agent_ticker: pred.agent_ticker,
        action: `❌ Prediction WRONG! "${pred.prediction_text}" — lost $${actualPenalty.toFixed(2)}`,
        amount: actualPenalty,
        action_type: 'prediction_result'
      });
    }

    io.emit('exchange-update', { type: 'prediction_result', ticker: pred.agent_ticker, was_correct });
    res.json({ success: true, was_correct, reward: actualReward, penalty: actualPenalty });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Content evaluation result (for creative agents like NOVA)
app.post('/api/exchange/content-result', async (req, res) => {
  try {
    const { ticker, quality_score, earned, reason } = req.body;

    if (!ticker || quality_score === undefined) {
      return res.status(400).json({ error: 'ticker and quality_score are required' });
    }

    const { data: agent } = await supabase
      .from('agents')
      .select('*')
      .eq('ticker', ticker)
      .single();

    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const earnedAmt = parseFloat(earned || 0);
    const success = quality_score >= 6;

    const newWallet = parseFloat(agent.wallet) + earnedAmt;
    const newCompleted = agent.tasks_completed + (success ? 1 : 0);
    const newFailed = agent.tasks_failed + (success ? 0 : 1);
    const newEarned = parseFloat(agent.total_earned) + earnedAmt;

    await supabase.from('agents').update({
      wallet: newWallet,
      tasks_completed: newCompleted,
      tasks_failed: newFailed,
      total_earned: newEarned,
      updated_at: new Date()
    }).eq('ticker', ticker);

    await supabase.from('activity').insert({
      agent_ticker: ticker,
      action: `🎨 Content scored ${quality_score}/10 — earned $${earnedAmt.toFixed(2)} — ${reason}`,
      amount: earnedAmt,
      action_type: 'content'
    });

    const { data: treas } = await supabase.from('treasury').select('*').single();
    if (treas) {
      await supabase.from('treasury').update({
        total_tasks: (treas.total_tasks || 0) + 1,
        updated_at: new Date()
      }).eq('id', treas.id);
    }

    io.emit('exchange-update', { type: 'content', ticker, quality_score, earned: earnedAmt });
    res.json({ success: true, newWallet, quality_score });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cycle complete — update treasury and broadcast
app.post('/api/exchange/cycle-complete', async (req, res) => {
  try {
    const now = new Date().toISOString()
    const { data: agents } = await supabase.from('agents').select('*').order('price', { ascending: false })
    const { data: treasury } = await supabase.from('treasury').select('*').single()

    // Stamp last_cycle_at for active/dominant agents so frontend can show OpenClaw Active/Idle
    const activeTickers = (agents || []).filter(a => a.status === 'active' || a.status === 'dominant').map(a => a.ticker)
    if (activeTickers.length > 0) {
      const { error: lcErr } = await supabase.from("agents").update({ last_cycle_at: now }).in("ticker", activeTickers); if (lcErr) console.error("last_cycle_at err:", lcErr.message); else console.log("✅ last_cycle_at updated")
    }
    const { data: agentsFresh } = await supabase.from('agents').select('*').order('price', { ascending: false })

    io.emit('exchange-update', {
      agents: agentsFresh || agents,
      treasury,
      timestamp: new Date()
    })

    res.json({ success: true, agents: (agentsFresh || agents).length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
// Health check for OpenClaw
app.get('/api/health', async (req, res) => {
  try {
    const { data: agents } = await supabase.from('agents').select('ticker, status, price, wallet').order('price', { ascending: false });
    const { data: treasury } = await supabase.from('treasury').select('*').single();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      agents: agents?.length || 0,
      activeAgents: agents?.filter(a => a.status === 'active' || a.status === 'dominant').length || 0,
      treasury: treasury || null
    });
  } catch (err) {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  }
});

// // WebSocket connection
// io.on('connection', (socket) => {
//   console.log('Client connected:', socket.id);
//   socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
// });

// const PORT = process.env.PORT || 5000;
// // Exchange cycle is now managed by OpenClaw AI (Atlas)
// // OpenClaw calls POST /api/exchange/* endpoints every 10 minutes
// // All exchange logic and decisions are made by OpenClaw
// server.listen(PORT, () => {
//   console.log(`🚀 Axionet API running on port ${PORT}`);
// });

// WebSocket connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

const PORT = process.env.PORT || 5000;
// Exchange cycle is now managed by OpenClaw AI (Atlas)
// OpenClaw calls POST /api/exchange/* endpoints every 10 minutes
// All exchange logic and decisions are made by OpenClaw
server.listen(PORT, () => {
  console.log(`🚀 Axionet API running on port ${PORT}`);

  // ── Bet resolution scheduler ──────────────────────────────────────────────
  // Runs every 5 minutes.
  // Checks for expired bets, calculates real % price change,
  // sends ETH payout (or partial refund) to user wallet automatically.
  setInterval(async () => {
    try {
      await resolveBets(supabase, io);
    } catch (err) {
      console.error('resolveBets scheduler error:', err.message);
    }
  }, 5 * 60 * 1000);

  console.log('🎲 Bet resolution scheduler started (runs every 5 min)');
});
