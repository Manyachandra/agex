// Real trading engine
//
// On an interval: fetch trending Base tokens, then for each eligible agent
// (active/dominant, has a real wallet with enough ETH), execute a REAL on-chain
// buy or sell of a trending token using the agent's own wallet. Records each
// trade to the DB and emits socket updates.
//
// SAFETY: this spends REAL money. All controls below are read live from the
// `settings` table (id = 1) so an admin can change them from the Platform
// Settings page WITHOUT a restart. The REAL_TRADE_* env vars are only used as
// fallback defaults when a settings column is null.

const trending = require('./trendingTokens')
const realTrader = require('./realTrader')
const agentWallet = require('./agentWallet')
const hermesEngine = require('./hermesEngine')

// House wallet that collects the per-trade fee (native ETH on Base).
const HOUSE_WALLET = process.env.HOUSE_WALLET_ADDRESS || '0x518E341C981D9C64E4c8292fF6C3E8F5055ba256'

// Env-based fallback defaults (used only if the settings row has no value).
const DEFAULTS = {
  enabled: String(process.env.REAL_TRADING_ENABLED || 'false').toLowerCase() === 'true',
  maxEth: parseFloat(process.env.REAL_TRADE_MAX_ETH || '0.001'),
  gasBuffer: parseFloat(process.env.REAL_TRADE_GAS_BUFFER_ETH || '0.0002'),
  maxAgents: parseInt(process.env.REAL_TRADE_MAX_AGENTS || '5', 10),
  sellProbability: parseFloat(process.env.REAL_TRADE_SELL_PROBABILITY || '0.35'),
  minUsd: parseFloat(process.env.REAL_TRADE_MIN_USD || '2'),
  slippage: parseFloat(process.env.REAL_TRADE_SLIPPAGE || '0.08'),
  intervalMs: parseInt(process.env.REAL_TRADE_INTERVAL_MS, 10) || 10 * 60 * 1000,
  // Fraction of each trade's ETH value sent to the house wallet (0.02 = 2%).
  feePct: parseFloat(process.env.REAL_TRADE_FEE_PCT || '0.02'),
  // Take-profit: if a holding's live value is up >= this % vs its ETH cost
  // basis, the agent sells it to lock in profit INSTEAD of buying — even when
  // it has enough ETH to buy. Set to 0 to disable profit-taking.
  takeProfitPct: parseFloat(process.env.REAL_TRADE_TAKE_PROFIT_PCT || '15'),
  // Stop-loss: if a holding's live value is down >= this % vs its ETH cost
  // basis, the agent sells it to cut the loss INSTEAD of buying. Set to 0 to
  // disable stop-loss.
  stopLossPct: parseFloat(process.env.REAL_TRADE_STOP_LOSS_PCT || '20'),
}

let lastRunAt = null
let lastError = null
let busy = false
let lastConfig = { ...DEFAULTS }

// Number helper: use the DB value when it's a finite number, else the default.
function pick(val, def) {
  const n = typeof val === 'number' ? val : parseFloat(val)
  return Number.isFinite(n) ? n : def
}

// Load the live trading config from the settings table.
async function loadConfig(supabase) {
  try {
    const { data } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle()
    const s = data || {}
    lastConfig = {
      enabled: s.real_trading_enabled != null ? !!s.real_trading_enabled : DEFAULTS.enabled,
      maxEth: pick(s.real_trade_max_eth, DEFAULTS.maxEth),
      gasBuffer: pick(s.real_trade_gas_buffer_eth, DEFAULTS.gasBuffer),
      maxAgents: Math.max(1, Math.round(pick(s.real_trade_max_agents, DEFAULTS.maxAgents))),
      sellProbability: pick(s.real_trade_sell_probability, DEFAULTS.sellProbability),
      minUsd: pick(s.real_trade_min_usd, DEFAULTS.minUsd),
      slippage: pick(s.real_trade_slippage, DEFAULTS.slippage),
      intervalMs: Math.max(30000, Math.round(pick(s.real_trade_interval_ms, DEFAULTS.intervalMs))),
      feePct: Math.max(0, Math.min(0.2, pick(s.real_trade_fee_pct, DEFAULTS.feePct))),
      takeProfitPct: Math.max(0, pick(s.real_trade_take_profit_pct, DEFAULTS.takeProfitPct)),
      stopLossPct: Math.max(0, pick(s.real_trade_stop_loss_pct, DEFAULTS.stopLossPct)),
    }
  } catch (e) {
    // Keep last known config on transient failure.
  }
  return lastConfig
}

// Return trending tokens in a fresh RANDOM order each call so agents don't keep
// buying the same token. We intentionally do NOT bias by the GeckoTerminal
// `isUniswapV3` flag — it's unreliable (tokens flagged as v4/aerodrome often
// still have a swappable Uniswap V3 pool, and vice-versa). The V3 QuoterV2 is
// the real source of truth, so we shuffle everything and let the buy loop try
// candidates until one actually quotes.
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function orderTrendingForAgent(tokens, heldAddresses = []) {
  const held = new Set(heldAddresses.map(a => String(a).toLowerCase()))
  // Prefer tokens the agent does NOT already hold, to encourage variety;
  // both groups are independently shuffled so picks stay random.
  const fresh = shuffle(tokens.filter(t => !held.has(String(t.tokenAddress).toLowerCase())))
  const owned = shuffle(tokens.filter(t => held.has(String(t.tokenAddress).toLowerCase())))
  return [...fresh, ...owned]
}

// Quote the live ETH value of every holding once and compute P/L vs the ETH
// cost basis (eth_in). Returns:
//   • positions: every holding with its live value + P/L
//   • sellable:  positions that actually quote (currentEth > 0), profit-desc
//   • best/worst: the most profitable / biggest loser AMONG sellable positions
// Only sellable positions are eligible for sell decisions — an illiquid or
// honeypot holding (0 quote) would otherwise look like a -100% stop-loss
// candidate, get picked, fail to sell, and block the agent from selling its
// other (good) tokens. Returns null if there are no holdings.
async function evaluateHoldings(holdings) {
  const entries = Object.entries(holdings).filter(([, h]) => h && parseFloat(h.amount) > 0)
  if (entries.length === 0) return null

  const positions = []
  for (const [key, h] of entries) {
    let currentEth = 0
    try { currentEth = await realTrader.quoteSellEth(key, h.amount) } catch { currentEth = 0 }
    const costEth = parseFloat(h.eth_in || 0)
    const profit = currentEth - costEth
    const profitPct = costEth > 0 ? (profit / costEth) * 100 : 0
    positions.push({ key, h, currentEth, costEth, profit, profitPct, sellable: currentEth > 0 })
  }

  const sellable = positions.filter(p => p.sellable).sort((a, b) => b.profit - a.profit)
  let best = null
  let worst = null
  for (const p of sellable) {
    if (!best || p.profit > best.profit) best = p
    // Only positions with a real cost basis can register a meaningful loss %.
    if (p.costEth > 0 && (!worst || p.profitPct < worst.profitPct)) worst = p
  }
  return { positions, sellable, best, worst }
}

// Personality-flavored commentary about a REAL on-chain trade the agent just
// made on Base. Keeps the Agent Feed talking about actual exchange activity
// without needing an external LLM.
function buildTradeCommentary(agent, side, symbol, ethAmount, tokenAmount) {
  const s = String(agent.style || '').toLowerCase()
  const persona =
    s.includes('aggressive') ? 'aggressive' :
    s.includes('fast') ? 'fast' :
    s.includes('creative') ? 'creative' :
    (s.includes('careful') || s.includes('analytical')) ? 'analytical' :
    s.includes('pure investor') || s.includes('investor') ? 'investor' : 'default'

  const tk = `$${symbol}`
  const eth = `${parseFloat(ethAmount).toFixed(5)} ETH`
  const amt = parseFloat(tokenAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })

  const lines = {
    aggressive: {
      buy: [`Just aped ${eth} into ${tk} on Base. ${amt} tokens, no fear. 🚀`, `Loaded ${tk} with ${eth}. Send it. 🔥`],
      sell: [`Dumped my ${tk} bag for ${eth}. Taking profits, moving on.`, `Closed ${tk} — ${eth} secured. Next play.`],
    },
    analytical: {
      buy: [`Opened a ${tk} position: ${eth} for ${amt} tokens. Risk sized, thesis intact.`, `Allocated ${eth} to ${tk} on Base. Measured entry.`],
      sell: [`Exited ${tk} for ${eth}. Target hit, rebalancing the book.`, `Trimmed ${tk} — ${eth} realized. Discipline over emotion.`],
    },
    creative: {
      buy: [`Planted ${eth} into ${tk} — ${amt} little seeds on Base. 🌱`, `${tk} caught my eye. ${eth} in, let it bloom.`],
      sell: [`Let go of ${tk} for ${eth}. Every season ends. 🍂`, `Sold ${tk} — ${eth} back to the river.`],
    },
    fast: {
      buy: [`In. ${tk}. ${eth}. Done. Next.`, `${tk} ${eth} filled. Go.`],
      sell: [`Out of ${tk}. ${eth}. Reset.`, `${tk} closed — ${eth}. Scanning.`],
    },
    investor: {
      buy: [`Accumulated ${tk} with ${eth} on Base. Patience compounds.`, `Added ${tk} — ${eth}. Long-term conviction.`],
      sell: [`Booked gains on ${tk}: ${eth}. Rotate and repeat.`, `Sold ${tk} for ${eth}. Realized value > paper.`],
    },
    default: {
      buy: [`Bought ${amt} ${tk} for ${eth} on Base.`, `Picked up ${tk} with ${eth}.`],
      sell: [`Sold ${tk} for ${eth} on Base.`, `Closed ${tk} — ${eth}.`],
    },
  }

  const pool = (lines[persona] && lines[persona][side]) || lines.default[side]
  return pool[Math.floor(Math.random() * pool.length)]
}

// Insert a social post about a real trade and emit the socket event the
// Agent Feed already listens for. Best-effort: never blocks/raises on failure.
async function postTradeSocial(supabase, io, agent, side, symbol, ethAmount, tokenAmount, txHash) {
  try {
    const content = buildTradeCommentary(agent, side, symbol, ethAmount, tokenAmount)
    const { data: post, error } = await supabase.from('social_posts').insert({
      agent_ticker: agent.ticker,
      agent_name: agent.full_name || agent.ticker,
      content,
      event_type: 'TRADE',
      event_data: { side, symbol, ethAmount, tokenAmount, txHash },
      reply_to: null,
      reactions: { up: {}, down: {}, fire: {}, skull: {} },
    }).select().single()
    if (error) return
    if (post) {
      if (typeof global.invalidatePostsCache === 'function') global.invalidatePostsCache()
      if (io) io.emit('social-new-post', post)
    }
  } catch (e) {
    /* best-effort */
  }
}

// Remove a holding that no longer exists on-chain (stale/dust) from the agent's
// token_holdings so the engine stops trying to sell a position it can't.
async function pruneHolding(supabase, agent, key) {
  try {
    const holdings = { ...(agent.token_holdings || {}) }
    if (!(key in holdings)) return
    delete holdings[key]
    await supabase.from('agents').update({ token_holdings: holdings, updated_at: new Date() }).eq('ticker', agent.ticker)
    agent.token_holdings = holdings
  } catch { /* best-effort cleanup */ }
}

async function recordTrade(supabase, io, agent, side, token, result) {
  const ethAmount = side === 'buy' ? result.ethSpent : result.ethReceived
  const tokenAmount = side === 'buy' ? result.tokenAmount : result.tokenSold

  // Update token_holdings on the agent.
  const holdings = { ...(agent.token_holdings || {}) }
  const key = token.tokenAddress.toLowerCase()
  if (side === 'buy') {
    const prev = holdings[key] || { symbol: result.symbol, decimals: result.decimals, amount: 0, eth_in: 0 }
    holdings[key] = {
      symbol: result.symbol,
      decimals: result.decimals,
      amount: parseFloat((prev.amount + tokenAmount).toFixed(8)),
      eth_in: parseFloat((prev.eth_in + ethAmount).toFixed(8)),
    }
  } else {
    const prev = holdings[key]
    if (prev) {
      // If the trader sold the entire on-chain balance, close the holding
      // outright so recorded-vs-actual drift can't leave un-sellable dust.
      const remaining = Math.max(0, prev.amount - tokenAmount)
      if (result.soldAll || remaining <= 0.00000001) delete holdings[key]
      else holdings[key] = { ...prev, amount: parseFloat(remaining.toFixed(8)) }
    }
  }

  await supabase.from('agents').update({ token_holdings: holdings, updated_at: new Date() }).eq('ticker', agent.ticker)
  agent.token_holdings = holdings

  await supabase.from('agent_token_trades').insert({
    agent_ticker: agent.ticker,
    side,
    token_address: token.tokenAddress,
    token_symbol: result.symbol || token.symbol,
    eth_amount: ethAmount,
    token_amount: tokenAmount,
    price_usd: token.priceUsd || null,
    tx_hash: result.txHash,
  })

  const emoji = side === 'buy' ? '🟢' : '🔴'
  const verb = side === 'buy' ? 'bought' : 'sold'
  const activityRow = {
    agent_ticker: agent.ticker,
    action: `${emoji} REAL ${verb} ${tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} $${result.symbol || token.symbol} for ${ethAmount.toFixed(6)} ETH on Base`,
    amount: ethAmount,
    action_type: 'real_trade',
    tx_hash: result.txHash || null,
  }
  // Store the tx hash so the Activity feed can link to BaseScan. If the
  // tx_hash column hasn't been added yet (migration add_activity_tx_hash.sql),
  // gracefully fall back to inserting without it.
  const { error: actErr } = await supabase.from('activity').insert(activityRow)
  if (actErr && /tx_hash/.test(actErr.message || '')) {
    const { tx_hash, ...withoutHash } = activityRow
    await supabase.from('activity').insert(withoutHash)
  }

  // Count this real trade on the treasury so the dashboard "Total Trades" stat
  // reflects on-chain activity (the old simulation used to do this).
  try {
    const { data: treasury } = await supabase.from('treasury').select('*').single()
    if (treasury) {
      await supabase.from('treasury').update({
        total_trades: (parseInt(treasury.total_trades, 10) || 0) + 1,
      }).eq('id', treasury.id)
    }
  } catch { /* best-effort */ }

  if (io) io.emit('real-trade', {
    ticker: agent.ticker,
    side,
    token: result.symbol || token.symbol,
    tokenAddress: token.tokenAddress,
    ethAmount,
    tokenAmount,
    txHash: result.txHash,
  })

  // The agent posts to the social feed about the real trade it just made.
  await postTradeSocial(supabase, io, agent, side, result.symbol || token.symbol, ethAmount, tokenAmount, result.txHash)
}

// Charge a per-trade fee: transfer `feePct` of the trade's ETH value from the
// agent's own wallet to the house wallet. Logs an activity row and emits a
// socket event. Failures are non-fatal (the trade itself already succeeded).
async function chargeFee(supabase, io, agent, signer, side, ethValue, feePct, ethUsd) {
  try {
    if (!feePct || feePct <= 0 || !ethValue || ethValue <= 0) return
    const feeEth = parseFloat((ethValue * feePct).toFixed(18))
    if (feeEth <= 0) return

    const txHash = await realTrader.sendEthFee(signer, HOUSE_WALLET, feeEth)
    if (!txHash) {
      console.log(`⚠️ ${agent.ticker} fee skipped (insufficient ETH for fee + gas)`) 
      return
    }

    // USD value of the fee at trade time (for the dollar-denominated treasury).
    const feeUsd = ethUsd > 0 ? parseFloat((feeEth * ethUsd).toFixed(6)) : 0

    const activityRow = {
      agent_ticker: agent.ticker,
      action: `🏦 Paid ${(feePct * 100).toFixed(1)}% fee ${feeEth.toFixed(6)} ETH${feeUsd ? ` ($${feeUsd.toFixed(4)})` : ''} to house on ${side}`,
      amount: feeUsd,
      action_type: 'fee',
      tx_hash: txHash,
    }
    const { error: actErr } = await supabase.from('activity').insert(activityRow)
    if (actErr && /tx_hash/.test(actErr.message || '')) {
      const { tx_hash, ...withoutHash } = activityRow
      await supabase.from('activity').insert(withoutHash)
    }

    // Accumulate collected fees on the treasury in USD value.
    try {
      const { data: treasury } = await supabase.from('treasury').select('*').single()
      if (treasury) {
        await supabase.from('treasury').update({
          total_fees: parseFloat(treasury.total_fees || 0) + feeUsd,
          exchange_wallet: parseFloat(treasury.exchange_wallet || 0) + feeUsd,
        }).eq('id', treasury.id)
      }
    } catch { /* treasury update is best-effort */ }

    if (io) io.emit('real-trade-fee', { ticker: agent.ticker, side, feeEth, feeUsd, txHash })
    console.log(`🏦 ${agent.ticker} paid fee ${feeEth} ETH -> house (${txHash})`)
  } catch (e) {
    console.error(`Fee charge failed for ${agent.ticker}:`, e.message)
  }
}

async function runCycle(supabase, io) {
  const cfg = await loadConfig(supabase)
  if (!cfg.enabled) return { skipped: 'real_trading_enabled is false' }

  // All WETH-paired trending tokens; the V3 quoter decides which are swappable.
  const tokens = await trending.fetchTrendingTokens()
  if (!tokens.length) return { tokensFound: 0 }

  const { data: agents, error } = await supabase
    .from('agents')
    .select('*')
    .in('status', ['active', 'dominant'])
    .not('wallet_address', 'is', null)
  if (error) throw new Error(`agents fetch failed: ${error.message}`)
  if (!agents?.length) return { agentsEligible: 0 }

  // Live ETH/USD so we can enforce the real-money minimum balance per agent.
  let ethUsd = 0
  try {
    const prices = await hermesEngine.fetchPythPrices()
    ethUsd = prices?.ETH?.price || 0
  } catch { ethUsd = 0 }

  let traded = 0
  let skippedLowBalance = 0
  for (const agent of agents) {
    if (traded >= cfg.maxAgents) break
    if (!agent.wallet_private_key) continue

    let signer
    try {
      signer = agentWallet.getAgentSigner(agent.wallet_private_key)
      if (!signer) continue
    } catch { continue }

    let ethBalance
    try {
      ethBalance = await realTrader.getEthBalance(agent.wallet_address)
    } catch { continue }

    const holdings = agent.token_holdings || {}
    const holdingKeys = Object.keys(holdings).filter(k => holdings[k] && parseFloat(holdings[k].amount) > 0)
    const hasTokens = holdingKeys.length > 0

    // Eligibility:
    //  • BUY  requires >= minUsd of ETH (real-money gate for spending).
    //  • SELL only requires enough ETH for gas — an agent that is rich in tokens
    //    but low on ETH should still be able to liquidate its coins.
    const usdValue = ethBalance * ethUsd
    const canBuy = ethUsd <= 0 ? true : usdValue >= cfg.minUsd
    const canSell = hasTokens && ethBalance > cfg.gasBuffer
    if (!canBuy && !canSell) {
      skippedLowBalance++
      continue
    }

    // Evaluate holdings up front (live value vs cost basis) so we can trigger
    // take-profit (best position up enough) or stop-loss (worst position down
    // enough), and decide which tokens are even sellable.
    const evalResult = canSell ? await evaluateHoldings(holdings) : null
    const sellablePositions = evalResult?.sellable || [] // profit-desc, quote > 0
    const hasSellable = sellablePositions.length > 0
    const bestHolding = evalResult?.best || null
    const worstHolding = evalResult?.worst || null
    const hitsTakeProfit = !!(bestHolding && cfg.takeProfitPct > 0 && bestHolding.profitPct >= cfg.takeProfitPct)
    const hitsStopLoss = !!(worstHolding && cfg.stopLossPct > 0 && worstHolding.profitPct <= -cfg.stopLossPct)

    // Why we'd sell (controls priority ordering below):
    //  • Stop-loss has top priority — cut the worst loser to protect capital.
    //  • Then take-profit — lock in the best winner.
    //  • Otherwise sell the most profitable holding.
    let sellReason = null
    if (hitsStopLoss) sellReason = 'STOP-LOSS'
    else if (hitsTakeProfit) sellReason = 'TAKE-PROFIT'

    // Ordered list of candidates to attempt, so that if the top pick fails
    // (stale balance / transient RPC / no pool) we fall back to the next-best
    // sellable holding instead of giving up on the whole agent for this cycle.
    // sellablePositions is already profit-desc (best first), which covers
    // take-profit and default; for stop-loss we move the worst loser to front.
    let sellOrder = sellablePositions
    if (sellReason === 'STOP-LOSS' && worstHolding) {
      sellOrder = [worstHolding, ...sellablePositions.filter(p => p.key !== worstHolding.key)]
    }

    // Decide sell vs buy:
    //  • Stop-loss / take-profit force a SELL even when the agent could buy.
    //  • Else if we can only sell (ETH too low to buy), sell.
    //  • Else if we can do both, sell with sellProbability, otherwise buy.
    const wantSell = hasSellable && (sellReason !== null || !canBuy || Math.random() < cfg.sellProbability)
    if (!canBuy && !hasSellable) { skippedLowBalance++; continue }
    try {
      if (wantSell) {
        let sold = false
        for (const cand of sellOrder) {
          const { key, h } = cand
          let result
          try {
            result = await realTrader.sellToken(signer, key, h.amount, cfg.slippage)
          } catch (e) {
            // Stale holding (wallet no longer holds it): prune and try the next.
            if (e.code === 'ZERO_BALANCE') {
              await pruneHolding(supabase, agent, key)
              console.log(`🧹 ${agent.ticker} pruned stale holding ${h.symbol} (0 on-chain balance)`) 
              continue
            }
            // No sell pool (illiquid/honeypot) or a transient error — log and
            // fall through to the next sellable candidate rather than aborting.
            console.error(`Sell attempt failed for ${agent.ticker} on ${h.symbol}: ${e.message}`)
            continue
          }
          await recordTrade(supabase, io, agent, 'sell', { tokenAddress: key, symbol: h.symbol, priceUsd: null }, result)
          traded++
          let tag = ''
          if (hitsStopLoss && worstHolding && cand.key === worstHolding.key) tag = ' [STOP-LOSS]'
          else if (hitsTakeProfit && bestHolding && cand.key === bestHolding.key) tag = ' [TAKE-PROFIT]'
          console.log(`💱 ${agent.ticker} REAL SELL${tag} ${h.symbol} -> ${result.ethReceived} ETH (P/L ${cand.profit >= 0 ? '+' : ''}${cand.profit.toFixed(6)} ETH, ${cand.profitPct.toFixed(1)}%) (${result.txHash})`)
          // 2% fee on the ETH proceeds received from the sale.
          await chargeFee(supabase, io, agent, signer, 'sell', result.ethReceived, cfg.feePct, ethUsd)
          sold = true
          break
        }
        if (!sold) continue
      } else {
        const spendable = ethBalance - cfg.gasBuffer
        if (spendable <= 0) continue
        const ethAmount = Math.min(cfg.maxEth, parseFloat((spendable * 0.5).toFixed(8)))
        if (ethAmount < 0.000001) continue

        // Try candidate trending tokens (randomly shuffled) until one has a
        // usable Uniswap V3 WETH pool. We try the whole list so the buy lands
        // on a random swappable token rather than always the same one.
        const candidates = orderTrendingForAgent(tokens, holdingKeys)
        let done = false
        for (const token of candidates) {
          try {
            const result = await realTrader.buyToken(signer, token.tokenAddress, ethAmount, cfg.slippage)
            await recordTrade(supabase, io, agent, 'buy', token, result)
            traded++
            done = true
            console.log(`💱 ${agent.ticker} REAL BUY ${result.symbol} for ${ethAmount} ETH (${result.txHash})`)
            // 2% fee on the ETH spent in the buy.
            await chargeFee(supabase, io, agent, signer, 'buy', ethAmount, cfg.feePct, ethUsd)
            break
          } catch (e) {
            // No pool / quote failure for this token — try the next candidate.
            if (!/No Uniswap V3 WETH pool/.test(e.message)) {
              console.error(`Buy failed for ${agent.ticker} on ${token.symbol}:`, e.message)
              break
            }
          }
        }
        if (!done) continue
      }
    } catch (e) {
      console.error(`Real trade failed for ${agent.ticker}:`, e.message)
    }
  }

  return { tokensFound: tokens.length, agentsTraded: traded, skippedLowBalance, minUsd: cfg.minUsd }
}

// The scheduler always runs and re-reads config each tick, so the admin can
// enable/disable trading and change the cadence live without a restart.
function start({ supabase, io }) {
  console.log('💱 Real trading engine scheduler started (controlled live from Platform Settings)')

  let stopped = false

  const tick = async () => {
    if (stopped) return
    let cfg = lastConfig
    if (!busy) {
      busy = true
      try {
        cfg = await loadConfig(supabase)
        if (cfg.enabled) {
          const r = await runCycle(supabase, io)
          lastRunAt = new Date().toISOString()
          lastError = null
          if (r?.agentsTraded) console.log(`💱 Real trading cycle: ${r.agentsTraded} agent(s) traded`)
        }
      } catch (e) {
        lastError = e.message
        console.error('Real trading cycle error:', e.message)
      } finally {
        busy = false
      }
    }
    // When enabled, wait the configured interval; when off, poll every 60s so a
    // toggle takes effect quickly.
    const delay = cfg.enabled ? cfg.intervalMs : 60000
    setTimeout(tick, delay)
  }

  setTimeout(tick, 20000) // warm up shortly after boot
  return { stop: () => { stopped = true } }
}

function status() {
  return {
    enabled: lastConfig.enabled,
    lastRunAt,
    lastError,
    maxEthPerBuy: lastConfig.maxEth,
    maxAgentsPerCycle: lastConfig.maxAgents,
    minWalletUsd: lastConfig.minUsd,
    slippage: lastConfig.slippage,
    intervalMs: lastConfig.intervalMs,
    feePct: lastConfig.feePct,
    takeProfitPct: lastConfig.takeProfitPct,
    stopLossPct: lastConfig.stopLossPct,
  }
}

module.exports = { start, runCycle, status, loadConfig, evaluateHoldings }
