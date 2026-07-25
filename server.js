const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
// Load .env before any local modules that read process.env at import time.
dotenv.config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const createSocialRouter = require('./routes/social');
const createSettingsRouter = require('./routes/settings');
const { createFundsRouter } = require('./routes/funds');
const agentWallet = require('./services/agentWallet');
const trendingTokens = require('./services/trendingTokens');
const realTradingEngine = require('./services/realTradingEngine');
const walletBalances = require('./services/walletBalances');
const ethPrice = require('./services/ethPrice');
const ws = require('ws');

// Never expose an agent's private key over the API, and overwrite the legacy
// simulated `wallet` field with the agent's REAL on-chain USD balance so the
// whole site shows real money. Delegates to the walletBalances cache.
function stripAgentSecrets(agent) {
  return walletBalances.decorate(agent);
}

function isWalletAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim())
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(String(value || '').trim())
}

function agentOwnedBy(agent, userId) {
  const key = String(userId || '').toLowerCase().trim()
  if (!key || !agent) return false
  const byCreator = String(agent.created_by || '').toLowerCase()
  const byDeploy = String(agent.deploy_wallet || '').toLowerCase()
  return (byCreator && byCreator === key) || (byDeploy && byDeploy === key)
}

const MAX_STRATEGY_WORDS = 3000

function limitStrategyWords(text, max = MAX_STRATEGY_WORDS) {
  if (text == null) return text
  const raw = String(text)
  const parts = raw.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= max) return raw
  return parts.slice(0, max).join(' ')
}

const AVATAR_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** Upload avatar via service role (bypasses storage RLS). Returns public URL or null. */
async function uploadAgentAvatar({ ticker, base64, contentType, ext }) {
  if (!base64) return null
  const mime = String(contentType || '').toLowerCase()
  const safeExt = (ext || AVATAR_MIME[mime] || 'png').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'png'
  if (!AVATAR_MIME[mime] && !ext) {
    throw new Error('Unsupported image type (use JPG, PNG, WebP, or GIF)')
  }
  const raw = String(base64).replace(/^data:[^;]+;base64,/, '')
  const buffer = Buffer.from(raw, 'base64')
  if (!buffer.length) throw new Error('Empty avatar payload')
  if (buffer.length > 2 * 1024 * 1024) throw new Error('Image must be under 2MB')

  const path = `${String(ticker).toUpperCase()}-${Date.now()}.${safeExt}`
  const { error } = await supabase.storage
    .from('agent-avatars')
    .upload(path, buffer, {
      contentType: mime || `image/${safeExt}`,
      upsert: true,
    })
  if (error) throw new Error(error.message || 'Avatar upload failed')

  const { data: urlData } = supabase.storage.from('agent-avatars').getPublicUrl(path)
  return urlData?.publicUrl || null
}
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    // Node < 22 has no global WebSocket; supabase-js realtime needs `ws`.
    realtime: { transport: ws },
  }
);

// Ensures exactly one treasury row exists and is used for KPIs / fee accounting.
// Multiple rows used to accumulate because maybeSingle() fails when duplicates
// exist, which caused ensureTreasury to keep inserting zeros (dashboard showed $0 / 0).
async function ensureTreasury() {
  const { data: rows, error } = await supabase
    .from('treasury')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('ensureTreasury select error:', error.message);
    return null;
  }
  const list = rows || [];

  // Prefer the row with the most real accounting signal.
  const score = (r) =>
    (parseFloat(r.total_fees) || 0) * 1000 +
    (parseInt(r.total_trades, 10) || 0) +
    (parseFloat(r.exchange_wallet) || 0);

  if (list.length === 0) {
    const { data: created, error: insErr } = await supabase
      .from('treasury')
      .insert({
        total_fees: 0,
        total_trades: 0,
        total_tasks: 0,
        exchange_wallet: 0,
        updated_at: new Date(),
      })
      .select()
      .single();
    if (insErr) {
      console.error('ensureTreasury insert error:', insErr.message);
      return null;
    }
    console.log('🏦 Seeded initial treasury row');
    return created;
  }

  list.sort((a, b) => score(b) - score(a));
  const canonical = list[0];

  // Drop empty duplicate rows so .single() callers stop breaking.
  const dupIds = list.slice(1).map((r) => r.id).filter(Boolean);
  if (dupIds.length) {
    const { error: delErr } = await supabase.from('treasury').delete().in('id', dupIds);
    if (delErr) console.error('ensureTreasury dedupe error:', delErr.message);
    else console.log(`🏦 Removed ${dupIds.length} duplicate treasury row(s)`);
  }

  return canonical;
}

/** Invalidate in-memory treasury cache after writes. */
function bustTreasuryCache() {
  treasuryCache = null;
  treasuryCacheTime = 0;
}

app.use(cors());
app.use(express.json({ limit: '4mb' }));
app.use('/api/social', createSocialRouter(supabase, io));
app.use('/api/settings', createSettingsRouter(supabase, io));
app.use('/api/funds', createFundsRouter(supabase, io));

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
  agentsCache = stripAgentSecrets(data);
  agentsCacheTime = now;
  res.json(agentsCache);
});

// Owner's agents (by deploy_wallet / created_by)
app.get('/api/agents/mine/:userId', async (req, res) => {
  try {
    const key = String(req.params.userId || '').toLowerCase().trim();
    if (!key) return res.json([]);

    const { data: byDeploy } = await supabase
      .from('agents')
      .select('*')
      .ilike('deploy_wallet', key)
      .order('created_at', { ascending: false });

    let byCreator = [];
    if (isUuid(key)) {
      const { data } = await supabase
        .from('agents')
        .select('*')
        .eq('created_by', key)
        .order('created_at', { ascending: false });
      byCreator = data || [];
    } else {
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .ilike('created_by', key)
        .order('created_at', { ascending: false });
      if (!error) byCreator = data || [];
    }

    const seen = new Set();
    const merged = [];
    for (const a of [...(byDeploy || []), ...byCreator]) {
      if (!a?.ticker || seen.has(a.ticker)) continue;
      seen.add(a.ticker);
      merged.push(a);
    }
    merged.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    res.json(walletBalances.decorate(merged));
  } catch {
    res.json([]);
  }
});

// Get single agent
app.get('/api/agents/:ticker', async (req, res) => {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('ticker', req.params.ticker)
    .single();
  if (error) return res.status(500).json({ error });
  res.json(stripAgentSecrets(data));
});

// Get an agent's REAL on-chain wallet balance (native ETH + payment token).
app.get('/api/agents/:ticker/wallet', async (req, res) => {
  try {
    const { data: agent, error } = await supabase
      .from('agents')
      .select('ticker, wallet_address')
      .eq('ticker', req.params.ticker)
      .single();
    if (error || !agent) return res.status(404).json({ error: 'Agent not found' });
    if (!agent.wallet_address) {
      return res.json({ ticker: agent.ticker, address: null, eth: 0, token: 0, tokenSymbol: agentWallet.TOKEN_SYMBOL });
    }
    const balances = await agentWallet.getWalletBalances(agent.wallet_address);
    res.json({ ticker: agent.ticker, ...balances });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Owner-only update of an agent's editable fields
app.put('/api/agents/:ticker', async (req, res) => {
  try {
    const {
      userId, tradingStrategy, fullName, name, avatarUrl,
      avatarBase64, avatarContentType, avatarExt,
    } = req.body || {};
    if (!userId) return res.status(401).json({ error: 'userId required' });

    const { data: agent, error: fetchErr } = await supabase
      .from('agents')
      .select('*')
      .eq('ticker', req.params.ticker)
      .single();
    if (fetchErr || !agent) return res.status(404).json({ error: 'Agent not found' });
    if (!agentOwnedBy(agent, userId)) {
      return res.status(403).json({ error: 'Not authorized to edit this agent' });
    }

    const updates = { updated_at: new Date() };
    if (tradingStrategy !== undefined) {
      updates.trading_strategy = limitStrategyWords(tradingStrategy);
    }
    const nextName = fullName !== undefined ? fullName : name;
    if (nextName !== undefined) {
      const cleanName = String(nextName).trim().toUpperCase().replace(/[^A-Z0-9 ]/g, '');
      if (cleanName.length < 2 || cleanName.length > 12) {
        return res.status(400).json({ error: 'Name must be 2-12 characters (A-Z, 0-9, spaces)' });
      }
      updates.full_name = cleanName;
    }

    if (avatarBase64) {
      try {
        const uploaded = await uploadAgentAvatar({
          ticker: req.params.ticker,
          base64: avatarBase64,
          contentType: avatarContentType,
          ext: avatarExt,
        });
        if (uploaded) updates.avatar_url = uploaded;
      } catch (upErr) {
        return res.status(400).json({ error: upErr.message || 'Avatar upload failed' });
      }
    } else if (avatarUrl !== undefined) {
      updates.avatar_url = avatarUrl ? String(avatarUrl).slice(0, 500) : null;
    }

    const { data, error } = await supabase
      .from('agents')
      .update(updates)
      .eq('ticker', req.params.ticker)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    agentsCache = null;
    io.emit('agent-updated', stripAgentSecrets(data));
    res.json(stripAgentSecrets(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Owner-only: decrypt and return the agent's wallet private key (revealed on demand).
app.post('/api/agents/:ticker/reveal-key', async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(401).json({ error: 'userId required' });

    const { data: agent, error } = await supabase
      .from('agents')
      .select('ticker, wallet_address, wallet_private_key, created_by, deploy_wallet')
      .eq('ticker', req.params.ticker)
      .single();
    if (error || !agent) return res.status(404).json({ error: 'Agent not found' });
    if (!agentOwnedBy(agent, userId)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (!agent.wallet_private_key) {
      return res.status(404).json({ error: 'No wallet key on file for this agent' });
    }

    const privateKey = agentWallet.decryptPrivateKey(agent.wallet_private_key);
    if (!privateKey) {
      return res.status(500).json({ error: 'Could not decrypt wallet key' });
    }

    res.json({
      ticker: agent.ticker,
      address: agent.wallet_address || null,
      privateKey,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

// Real 2% fee transactions (house fees collected from agent wallets).
// Sourced from the activity log (action_type = 'fee'); amount is the USD value.
app.get('/api/fees', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 1000);
    let query = supabase
      .from('activity')
      .select('*')
      .eq('action_type', 'fee')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (req.query.ticker) query = query.eq('agent_ticker', req.query.ticker);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Real on-chain token trades (ETH <-> trending tokens). Optional ?ticker=
// filters to a single agent's history.
app.get('/api/token-trades', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 1000, 5000);
    let query = supabase
      .from('agent_token_trades')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (req.query.ticker) query = query.eq('agent_ticker', req.query.ticker);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

  const row = await ensureTreasury();
  if (!row) {
    return res.json({ total_fees: 0, total_trades: 0, total_tasks: 0, exchange_wallet: 0 });
  }

  // Prefer live on-chain counters for desk KPIs (legacy treasury rows can be stale
  // after the Robinhood Chain cutover / duplicate-row bug).
  let totalTrades = parseInt(row.total_trades, 10) || 0;
  let totalFees = parseFloat(row.total_fees) || 0;
  try {
    const [{ count: onChainTrades }, feeRes] = await Promise.all([
      supabase.from('agent_token_trades').select('id', { count: 'exact', head: true }),
      supabase.from('activity').select('amount').eq('action_type', 'fee'),
    ]);
    if (typeof onChainTrades === 'number' && onChainTrades > 0) {
      totalTrades = onChainTrades;
    }
    const feeSum = (feeRes.data || []).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    if (feeSum > 0) {
      totalFees = feeSum;
    }
  } catch (e) {
    console.error('treasury live counters error:', e.message);
  }

  const data = {
    ...row,
    total_trades: totalTrades,
    total_fees: totalFees,
    exchange_wallet: totalFees,
  };
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

// Get user profile by wallet address (or legacy uuid)
app.get('/api/user/profile/:userId', async (req, res) => {
  try {
    const key = String(req.params.userId || '').toLowerCase().trim();
    if (!key) return res.status(400).json({ error: 'Wallet required' });

    let data = null;
    let error = null;

    // Only query profiles.id with UUID values — wallet keys error on uuid columns
    // until wallet_only_auth.sql is applied.
    if (isUuid(key)) {
      const byId = await supabase
        .from('profiles')
        .select('*')
        .eq('id', key)
        .maybeSingle();
      data = byId.data;
      error = byId.error;
    }

    if (!data && isWalletAddress(key)) {
      const byWallet = await supabase
        .from('profiles')
        .select('*')
        .ilike('wallet_address', key)
        .maybeSingle();
      // Ignore missing-column errors before migration
      if (!byWallet.error) {
        data = byWallet.data;
      }
    }

    if (error || !data) return res.status(404).json({ error: 'Profile not found' });

    res.json(data);
  } catch (err) {
    console.error('Profile fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Create or update wallet profile
app.post('/api/user/profile', async (req, res) => {
  try {
    const wallet = String(req.body.walletAddress || req.body.id || '')
      .toLowerCase()
      .trim();
    if (!wallet || !wallet.startsWith('0x')) {
      return res.status(400).json({ error: 'Valid wallet address is required' });
    }

    const role = 'user';
    const username = req.body.username || `Trader ${wallet.slice(2, 6).toUpperCase()}`;

    let existing = null;
    if (isUuid(wallet)) {
      const { data } = await supabase.from('profiles').select('*').eq('id', wallet).maybeSingle();
      existing = data;
    }
    if (!existing) {
      const byWallet = await supabase
        .from('profiles')
        .select('*')
        .ilike('wallet_address', wallet)
        .maybeSingle();
      if (!byWallet.error) existing = byWallet.data;
    }

    // Until wallet_only_auth.sql is applied, profiles.id is uuid and cannot store
    // a wallet address. Return an ephemeral profile so the app can continue.
    if (!existing && isWalletAddress(wallet)) {
      const probe = await supabase
        .from('profiles')
        .insert({
          id: wallet,
          wallet_address: wallet,
          username,
          role,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (!probe.error && probe.data) {
        return res.json(probe.data);
      }

      console.warn(
        'Wallet profiles not migrated yet (run migrations/wallet_only_auth.sql). Using ephemeral profile.',
        probe.error?.message || ''
      );
      return res.json({
        id: wallet,
        wallet_address: wallet,
        username,
        role,
        avatar_url: null,
        email: null,
        ephemeral: true,
      });
    }

    const payload = {
      id: existing?.id || wallet,
      wallet_address: wallet,
      username: req.body.username || existing?.username || username,
      avatar_url: req.body.avatar_url ?? existing?.avatar_url ?? null,
      email: existing?.email || null,
      role: 'user',
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      // Prefer not writing wallet_address if the column is missing
      const updatePayload = { ...payload };
      const { data, error } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) {
        // Retry without wallet_address for pre-migration schemas
        const { wallet_address: _w, ...withoutWalletCol } = updatePayload;
        const retry = await supabase
          .from('profiles')
          .update(withoutWalletCol)
          .eq('id', existing.id)
          .select()
          .single();
        if (retry.error) {
          console.error('Profile update error:', retry.error);
          return res.status(500).json({ error: 'Failed to update profile' });
        }
        return res.json(retry.data);
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
      return res.status(500).json({ error: error.message || 'Failed to create profile' });
    }
    res.json(data);
  } catch (err) {
    console.error('Profile POST error:', err);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

// Update username / display fields for a wallet profile
app.patch('/api/user/profile/:userId', async (req, res) => {
  try {
    const key = String(req.params.userId || '').toLowerCase().trim();
    const username = (req.body.username || '').trim();
    if (!key) return res.status(400).json({ error: 'Wallet required' });
    if (username.length < 2) return res.status(400).json({ error: 'Username too short' });

    const { data: existingById } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', key)
      .maybeSingle();
    const { data: existingByWallet } = existingById
      ? { data: null }
      : await supabase
          .from('profiles')
          .select('id')
          .ilike('wallet_address', key)
          .maybeSingle();
    const existing = existingById || existingByWallet;
    if (!existing) return res.status(404).json({ error: 'Profile not found' });

    const { data, error } = await supabase
      .from('profiles')
      .update({ username, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message || 'Failed to update' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    const style = body.personalityStyle || body.style || '';
    const creatorName = body.creatorName || body.creator_name || null;
    const creatorTwitter = body.creatorTwitter || body.creator_twitter || null;
    const createdBy = (body.createdBy || body.created_by || body.userWallet || null);
    const normalizedCreator = createdBy ? String(createdBy).toLowerCase().trim() : null;
    const avatarUrl = body.avatarUrl || body.avatar_url || null;
    const avatarBase64 = body.avatarBase64 || null;
    const avatarContentType = body.avatarContentType || null;
    const avatarExt = body.avatarExt || null;
    const userWallet = body.userWallet
      ? String(body.userWallet).toLowerCase().trim()
      : (isWalletAddress(normalizedCreator) ? normalizedCreator : null)
    const tradingStrategy = body.tradingStrategy || body.trading_strategy || null;
    const tradingStrategyLimited = tradingStrategy != null
      ? limitStrategyWords(tradingStrategy)
      : null;

    if (!name || !ticker) {
      return res.status(400).json({ error: 'Name and ticker are required' });
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

    // Registration is free — agents fund their own real wallet.
    const fullName = `Agent ${cleanName.charAt(0) + cleanName.slice(1).toLowerCase()}`;

    // Generate a real EVM wallet for this agent on Robinhood Chain. The private key is
    // returned to the user exactly once below and stored encrypted at rest.
    const agentKeys = agentWallet.createAgentWallet();

    // created_by is still uuid in DBs that have not run wallet_only_auth.sql.
    // Store wallet ownership on deploy_wallet (text) and only write created_by
    // when the value is a legacy UUID.
    const createdByForDb = isUuid(normalizedCreator) ? normalizedCreator : null;
    const ownerWallet = userWallet || (isWalletAddress(normalizedCreator) ? normalizedCreator : null);

    let finalAvatarUrl = avatarUrl;
    if (avatarBase64) {
      try {
        finalAvatarUrl = await uploadAgentAvatar({
          ticker: cleanTicker,
          base64: avatarBase64,
          contentType: avatarContentType,
          ext: avatarExt,
        });
      } catch (upErr) {
        return res.status(400).json({ error: upErr.message || 'Avatar upload failed' });
      }
    }

    const insertData = {
      ticker: cleanTicker,
      full_name: fullName,
      style: style,
      trading_strategy: tradingStrategyLimited,
      price: 1.00,
      wallet: 0,
      tasks_completed: 0,
      tasks_failed: 0,
      total_earned: 0,
      shares_owned: {},
      status: 'active',
      cycle_count: 0,
      created_by: createdByForDb,
      creator_name: creatorName,
      creator_twitter: creatorTwitter,
      avatar_url: finalAvatarUrl,
      deploy_tx_hash: null,
      deploy_wallet: ownerWallet,
      wallet_address: agentKeys.address,
      wallet_private_key: agentWallet.encryptPrivateKey(agentKeys.privateKey),
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
      action: `🚀 NEW AGENT ${cleanTicker} is now LIVE on the exchange`,
      amount: 0,
      action_type: 'registration'
    });

    io.emit('agent-registered', { agent: stripAgentSecrets(agent) });

    // Return the agent (without the stored key) PLUS the freshly generated
    // wallet so the frontend can show the private key to the user one time.
    res.json({
      ...stripAgentSecrets(agent),
      agentWallet: {
        address: agentKeys.address,
        privateKey: agentKeys.privateKey,
      },
    });
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
    const { count: onChainTrades } = await supabase
      .from('agent_token_trades')
      .select('id', { count: 'exact', head: true });
    const { data: settings } = await supabase.from('settings').select('real_trade_fee_pct').eq('id', 1).maybeSingle();

    let totalFees = parseFloat(treasury?.total_fees) || 0;
    try {
      const feeRes = await supabase.from('activity').select('amount').eq('action_type', 'fee');
      const feeSum = (feeRes.data || []).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
      if (feeSum > 0) totalFees = feeSum;
    } catch (_) { /* keep treasury value */ }

    const feePct = Number.isFinite(parseFloat(settings?.real_trade_fee_pct))
      ? parseFloat(settings.real_trade_fee_pct)
      : parseFloat(process.env.REAL_TRADE_FEE_PCT || '0.02');

    if (!agents || !agents.length) {
      const empty = {
        avgPrice: '1.0000', topAgent: null, riskAgent: null,
        totalAgents: 0, activeAgents: 0,
        treasury: treasury || null,
        totalTrades: trades?.length || 0,
        onChainTrades: onChainTrades || 0,
        totalFees,
        feePct,
        feePctDisplay: Math.round(feePct * 10000) / 100,
      };
      statsCache = empty;
      statsCacheTime = Date.now();
      return res.json(empty);
    }

    const prices = agents.map(a => parseFloat(a.price));
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const topAgent = [...agents].sort((a, b) => b.price - a.price)[0];
    const riskAgent = [...agents]
      .sort((a, b) => a.wallet - b.wallet)[0];

    const result = {
      avgPrice: avgPrice.toFixed(4),
      topAgent: topAgent?.ticker,
      riskAgent: riskAgent?.ticker,
      totalAgents: agents.length,
      activeAgents: agents.length,
      treasury,
      totalTrades: trades?.length || 0,
      onChainTrades: onChainTrades || 0,
      totalFees,
      feePct,
      feePctDisplay: Math.round(feePct * 10000) / 100,
    };
    statsCache = result;
    statsCacheTime = Date.now();
    res.json(result);
  } catch (err) {
    res.json({
      avgPrice: '1.0000', topAgent: null, riskAgent: null,
      totalAgents: 0, activeAgents: 0,
      treasury: null, totalTrades: 0,
      onChainTrades: 0, totalFees: 0,
      feePct: 0.02, feePctDisplay: 2,
    });
  }
});

// ── EXCHANGE WRITE ENDPOINTS (legacy agent-market helpers / external clients) ──

// Legacy task-result endpoint — no-op (task W/L system removed)
app.post('/api/exchange/task-result', async (req, res) => {
  res.json({ success: true, deprecated: true })
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

    const { data: agent } = await supabase
      .from('agents')
      .select('*')
      .eq('ticker', pred.agent_ticker)
      .single();

    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    // Neutral score impact (agent "style" personalities removed from the product).
    const scoreBoost = 1.0;
    const penalty = 0.10;

    const actualReward = was_correct ? scoreBoost : 0;
    const actualPenalty = was_correct ? 0 : penalty;

    await supabase.from('predictions').update({
      status: was_correct ? 'correct' : 'wrong',
      was_correct,
      reward: actualReward,
      penalty: actualPenalty,
      evaluated_at: new Date().toISOString()
    }).eq('id', prediction_id);

    if (was_correct) {
      await supabase.from('activity').insert({
        agent_ticker: pred.agent_ticker,
        action: `Prediction correct — "${pred.prediction_text}"`,
        amount: actualReward,
        action_type: 'prediction_result'
      });
    } else {
      await supabase.from('activity').insert({
        agent_ticker: pred.agent_ticker,
        action: `Prediction wrong — "${pred.prediction_text}"`,
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

// Legacy content-result endpoint — no-op (task W/L system removed)
app.post('/api/exchange/content-result', async (req, res) => {
  res.json({ success: true, deprecated: true })
});

// Cycle complete — update treasury and broadcast
app.post('/api/exchange/cycle-complete', async (req, res) => {
  try {
    const now = new Date().toISOString()
    const { data: agents } = await supabase.from('agents').select('*').order('price', { ascending: false })
    const { data: treasury } = await supabase.from('treasury').select('*').single()

    // Stamp last_cycle_at for all agents so the desk can show cycle freshness
    const activeTickers = (agents || []).map(a => a.ticker)
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
// Health check
app.get('/api/health', async (req, res) => {
  try {
    const { data: agents } = await supabase.from('agents').select('ticker, status, price, wallet').order('price', { ascending: false });
    const { data: treasury } = await supabase.from('treasury').select('*').single();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      agents: agents?.length || 0,
      activeAgents: agents?.length || 0,
      treasury: treasury || null
    });
  } catch (err) {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  }
});

// ETH/USD (GeckoTerminal WETH on Robinhood Chain) — for desk USD displays
app.get('/api/eth-price', async (req, res) => {
  try {
    const usd = await ethPrice.fetchEthUsd();
    res.json({ usd, source: 'geckoterminal', network: process.env.TRENDING_NETWORK || 'robinhood' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trending tokens (used by the real trading engine; also handy for the UI)
app.get('/api/trending-tokens', async (req, res) => {
  try {
    const tokens = await trendingTokens.fetchTrendingTokens();
    res.json(tokens);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Real on-chain token trades for a specific agent
app.get('/api/agents/:ticker/token-trades', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('agent_token_trades')
      .select('*')
      .eq('agent_ticker', req.params.ticker)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Real trading engine status
app.get('/api/real-trading/status', (req, res) => {
  try {
    res.json(realTradingEngine.status());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WebSocket connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

// ── Single-deploy static sites (optional) ───────────────────────────────────
// Build the desk with `npm run build`, then one Node process serves API + SPA.
const FRONTEND_DIST = path.join(__dirname, 'dist');
const DOCS_DIR = path.join(__dirname, 'docs');
const LANDING_DIR = path.join(__dirname, 'landing');

if (fs.existsSync(DOCS_DIR)) {
  app.use('/docs', express.static(DOCS_DIR));
}
if (fs.existsSync(LANDING_DIR)) {
  app.use('/landing', express.static(LANDING_DIR));
}

if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  // SPA fallback for React Router (must stay after /api routes).
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const p = req.path || '';
    if (
      p.startsWith('/api') ||
      p.startsWith('/socket.io') ||
      p.startsWith('/docs') ||
      p.startsWith('/landing')
    ) {
      return next();
    }
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
  console.log(`📦 Serving desk from ${FRONTEND_DIST}`);
} else {
  console.log('📦 No dist/ yet — run `npm run build` for unified UI+API');
}

const PORT = process.env.PORT || 5000;
// Desk + API. Real on-chain trading on Robinhood Chain is driven by
// realTradingEngine (gated by REAL_TRADING_ENABLED / settings).
server.listen(PORT, () => {
  console.log(`🚀 Agex API running on port ${PORT}`);

  // Make sure the treasury row exists so dashboard KPIs and fee accounting work.
  ensureTreasury().catch((e) => console.error('ensureTreasury startup error:', e.message));

  // ── Real trading engine (agents swap ETH <-> trending tokens) ─────────
  // Gated by REAL_TRADING_ENABLED; spends real money from each agent's wallet.
  realTradingEngine.start({ supabase, io });

  // ── Real wallet balance cache ──────────────────────────────────────────────
  // Refreshes every agent's on-chain ETH balance (in USD via GeckoTerminal).
  walletBalances.start({ supabase });
});
