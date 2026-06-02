// Hermes engine
//
// Pulls real cryptocurrency prices from Pyth Network's Hermes API and uses
// the % change between cycles to drive agent prices and lightweight auto-trades.
// One cycle is intended to run every ~10 minutes; it is started from server.js.

const axios = require('axios')

const HERMES_BASE = process.env.HERMES_API_URL || 'https://hermes.pyth.network'

// Mainnet Pyth feed IDs (https://www.pyth.network/developers/price-feed-ids).
// Add or change symbols here to expand the universe agents can be linked to.
const PYTH_FEEDS = {
  BTC:  'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH:  'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL:  'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  BNB:  '2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f',
  XRP:  'ec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8',
  DOGE: 'dcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c',
  ADA:  '2a01deaec9e51a579277b34b122399984d0bbf57e2458a7e42fecd2829867a0d',
  AVAX: '93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7',
  LINK: '8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221',
  TON:  '8963217838ab4cf5cadc172203c1f0b763fbaa45f346d8ee50ba994bbcac3026',
}

const CRYPTOS = Object.keys(PYTH_FEEDS)

// Cache of the last Pyth price seen per symbol (used to compute % change
// between cycles). Reset on process restart, which is fine — the first cycle
// after a restart simply moves nothing for previously-unseen symbols.
const lastPythPrice = {}

// Last successful cycle time, used by an exported /api/hermes/status endpoint.
let lastCycleAt = null
let lastCycleError = null

function pickCryptoForTicker(ticker) {
  let h = 0
  const t = String(ticker || 'X')
  for (let i = 0; i < t.length; i++) h = ((h * 31) + t.charCodeAt(i)) | 0
  return CRYPTOS[Math.abs(h) % CRYPTOS.length]
}

// Agents with very different styles react more or less to the same crypto move.
function personalityFactor(style) {
  const s = String(style || '').toLowerCase()
  if (s.includes('aggressive')) return 2.0
  if (s.includes('fast')) return 1.5
  if (s.includes('creative')) return 1.3
  if (s.includes('careful') || s.includes('analytical')) return 0.7
  if (s.includes('pure investor')) return 1.0
  return 1.0
}

async function fetchPythPrices() {
  const ids = Object.values(PYTH_FEEDS).map((id) => `ids[]=${id}`).join('&')
  const url = `${HERMES_BASE}/v2/updates/price/latest?${ids}&parsed=true`
  const r = await axios.get(url, { timeout: 10000 })
  const parsed = r.data?.parsed || []
  const idToSym = Object.fromEntries(
    Object.entries(PYTH_FEEDS).map(([sym, id]) => [id.toLowerCase(), sym])
  )
  const out = {}
  for (const p of parsed) {
    const rawId = String(p.id || '').toLowerCase().replace(/^0x/, '')
    const sym = idToSym[rawId]
    if (!sym || !p.price) continue
    const price = Number(p.price.price) * Math.pow(10, Number(p.price.expo))
    if (!Number.isFinite(price) || price <= 0) continue
    out[sym] = { price, publish_time: p.price.publish_time }
  }
  return out
}

// Minimal internal buy/sell mirroring the math in the public /api/exchange
// endpoints. Kept lightweight on purpose — the engine doesn't need approvals,
// caches, or response payloads.
async function internalBuy(supabase, io, buyerAgent, targetAgent, shares, reason) {
  const price = parseFloat(targetAgent.price)
  const cost = shares * price
  const fee = parseFloat((cost * 0.02).toFixed(4))
  const total = cost + fee
  if (parseFloat(buyerAgent.wallet) < total) return false

  const sharesOwned = buyerAgent.shares_owned || {}
  if (sharesOwned[targetAgent.ticker]) {
    const existing = sharesOwned[targetAgent.ticker]
    const totalShares = existing.shares + shares
    const avgPrice = ((existing.shares * existing.avg_buy_price) + (shares * price)) / totalShares
    sharesOwned[targetAgent.ticker] = { shares: totalShares, avg_buy_price: parseFloat(avgPrice.toFixed(4)) }
  } else {
    sharesOwned[targetAgent.ticker] = { shares, avg_buy_price: price }
  }
  const newWallet = parseFloat(buyerAgent.wallet) - total

  await supabase.from('agents').update({
    wallet: newWallet,
    shares_owned: sharesOwned,
    updated_at: new Date(),
  }).eq('ticker', buyerAgent.ticker)

  await supabase.from('trades').insert({
    buyer_ticker: buyerAgent.ticker,
    seller_ticker: targetAgent.ticker,
    shares,
    price_at_trade: price,
    total_cost: cost,
    fee,
  })

  await supabase.from('activity').insert({
    agent_ticker: buyerAgent.ticker,
    action: `bought ${shares} share(s) of ${targetAgent.ticker} @ $${price.toFixed(4)} — ${reason}`,
    amount: cost,
    action_type: 'trade',
  })

  const { data: treasury } = await supabase.from('treasury').select('*').single()
  if (treasury) {
    await supabase.from('treasury').update({
      total_fees: parseFloat(treasury.total_fees) + fee,
      total_trades: treasury.total_trades + 1,
      exchange_wallet: parseFloat(treasury.exchange_wallet) + fee,
    }).eq('id', treasury.id)
  }

  io.emit('exchange-update', { type: 'trade', buyer: buyerAgent.ticker, target: targetAgent.ticker, shares, price })
  // Mutate the in-memory agent so the calling loop sees the new wallet/holdings.
  buyerAgent.wallet = newWallet
  buyerAgent.shares_owned = sharesOwned
  return true
}

async function internalSell(supabase, io, sellerAgent, assetAgent, shares, reason) {
  const sharesOwned = sellerAgent.shares_owned || {}
  const holding = sharesOwned[assetAgent.ticker]
  if (!holding || holding.shares < shares) return false

  const currentPrice = parseFloat(assetAgent.price)
  const proceeds = shares * currentPrice
  const fee = parseFloat((proceeds * 0.02).toFixed(4))
  const netProceeds = proceeds - fee
  const avgBuyPrice = holding.avg_buy_price
  const profit = ((currentPrice - avgBuyPrice) / avgBuyPrice * 100).toFixed(2)

  const remaining = holding.shares - shares
  if (remaining === 0) delete sharesOwned[assetAgent.ticker]
  else sharesOwned[assetAgent.ticker].shares = remaining

  const newWallet = parseFloat(sellerAgent.wallet) + netProceeds

  await supabase.from('agents').update({
    wallet: newWallet,
    shares_owned: sharesOwned,
    updated_at: new Date(),
  }).eq('ticker', sellerAgent.ticker)

  await supabase.from('trades').insert({
    buyer_ticker: assetAgent.ticker,
    seller_ticker: sellerAgent.ticker,
    shares,
    price_at_trade: currentPrice,
    total_cost: proceeds,
    fee,
  })

  await supabase.from('activity').insert({
    agent_ticker: sellerAgent.ticker,
    action: `sold ${shares} share(s) of ${assetAgent.ticker} @ $${currentPrice.toFixed(4)} (${profit}% profit) — ${reason}`,
    amount: netProceeds,
    action_type: 'trade',
  })

  const { data: treasury } = await supabase.from('treasury').select('*').single()
  if (treasury) {
    await supabase.from('treasury').update({
      total_fees: parseFloat(treasury.total_fees) + fee,
      total_trades: treasury.total_trades + 1,
      exchange_wallet: parseFloat(treasury.exchange_wallet) + fee,
    }).eq('id', treasury.id)
  }

  io.emit('exchange-update', { type: 'sell', seller: sellerAgent.ticker, asset: assetAgent.ticker, shares, price: currentPrice, profit })
  sellerAgent.wallet = newWallet
  sellerAgent.shares_owned = sharesOwned
  return true
}

async function runCycle(supabase, io) {
  const pyth = await fetchPythPrices()
  if (!Object.keys(pyth).length) {
    throw new Error('Pyth Hermes returned no parsed prices')
  }

  const now = new Date().toISOString()
  const { data: agents, error } = await supabase
    .from('agents')
    .select('*')
    .in('status', ['active', 'dominant'])
  if (error) throw new Error(`agents fetch failed: ${error.message}`)
  if (!agents?.length) {
    lastCycleAt = now
    return { agentsTouched: 0 }
  }

  // Index by ticker so internal trades can target rows from the same snapshot.
  const byTicker = Object.fromEntries(agents.map((a) => [a.ticker, a]))
  let touched = 0

  for (const agent of agents) {
    const sym = agent.crypto_symbol || pickCryptoForTicker(agent.ticker)
    const live = pyth[sym]
    if (!live) continue

    if (!agent.crypto_symbol) {
      await supabase.from('agents').update({ crypto_symbol: sym }).eq('ticker', agent.ticker)
      agent.crypto_symbol = sym
    }

    const prev = lastPythPrice[sym]
    const cryptoChange = prev ? (live.price - prev) / prev : 0
    const factor = personalityFactor(agent.style)
    const noise = (Math.random() - 0.5) * 0.01 // ±0.5% personality flavor

    const totalChange = cryptoChange * factor + noise
    const currentPrice = parseFloat(agent.price)
    const newPrice = Math.max(0.01, parseFloat((currentPrice * (1 + totalChange)).toFixed(4)))

    await supabase.from('agents').update({
      price: newPrice,
      cycle_count: (agent.cycle_count || 0) + 1,
      last_cycle_at: now,
      updated_at: new Date(),
    }).eq('ticker', agent.ticker)

    await supabase.from('price_history').insert({
      agent_ticker: agent.ticker,
      price: newPrice,
    })

    const pctStr = (cryptoChange * 100).toFixed(2)
    const arrow = cryptoChange >= 0 ? '▲' : '▼'
    await supabase.from('activity').insert({
      agent_ticker: agent.ticker,
      action: `📡 Pyth ${sym} ${arrow} ${pctStr}% → price $${currentPrice.toFixed(4)} → $${newPrice.toFixed(4)}`,
      amount: 0,
      action_type: 'price',
    })

    // Keep the in-memory snapshot fresh for any follow-up trades this cycle.
    agent.price = newPrice
    agent.cycle_count = (agent.cycle_count || 0) + 1

    // Light auto-trade driven by the crypto signal.
    // Only fires on meaningful moves so the activity feed isn't drowned.
    if (prev) {
      if (cryptoChange > 0.005 && parseFloat(agent.wallet) > 5) {
        const topOther = agents
          .filter((a) => a.ticker !== agent.ticker && (a.status === 'active' || a.status === 'dominant'))
          .sort((a, b) => parseFloat(b.price) - parseFloat(a.price))[0]
        if (topOther) {
          try {
            await internalBuy(supabase, io, agent, byTicker[topOther.ticker] || topOther, 1, `Hermes ${sym} +${pctStr}%`)
          } catch (e) {
            console.error(`Hermes buy failed for ${agent.ticker}:`, e.message)
          }
        }
      } else if (cryptoChange < -0.005) {
        const owned = agent.shares_owned || {}
        const candidates = Object.entries(owned).filter(([, v]) => v && v.shares >= 1)
        if (candidates.length) {
          const [targetTicker] = candidates[0]
          const targetAgent = byTicker[targetTicker]
          if (targetAgent) {
            try {
              await internalSell(supabase, io, agent, targetAgent, 1, `Hermes ${sym} ${pctStr}%`)
            } catch (e) {
              console.error(`Hermes sell failed for ${agent.ticker}:`, e.message)
            }
          }
        }
      }
    }

    io.emit('exchange-update', { type: 'price', ticker: agent.ticker, price: newPrice, source: 'hermes', crypto: sym })
    touched++
  }

  // Refresh memory of last Pyth prices for the next cycle.
  for (const sym of Object.keys(pyth)) lastPythPrice[sym] = pyth[sym].price

  io.emit('exchange-update', { type: 'cycle', source: 'hermes', timestamp: now, agentsTouched: touched })
  lastCycleAt = now
  lastCycleError = null
  return { agentsTouched: touched }
}

function start({ supabase, io, intervalMs = 10 * 60 * 1000 }) {
  console.log(`📡 Hermes engine starting (Pyth Hermes feeds, cycle every ${Math.round(intervalMs / 1000)}s)`)

  let busy = false
  const tick = async () => {
    if (busy) return
    busy = true
    try {
      const r = await runCycle(supabase, io)
      console.log(`📡 Hermes cycle ok — touched ${r.agentsTouched} agent(s)`)
    } catch (e) {
      lastCycleError = e.message
      console.error('Hermes cycle error:', e.message)
    } finally {
      busy = false
    }
  }

  // Warm up shortly after boot so the indicator goes "Active" quickly.
  setTimeout(tick, 5000)
  return setInterval(tick, intervalMs)
}

function status() {
  return {
    lastCycleAt,
    lastCycleError,
    feeds: Object.keys(PYTH_FEEDS),
    knownPrices: Object.fromEntries(Object.entries(lastPythPrice).map(([k, v]) => [k, Number(v.toFixed(6))])),
  }
}

module.exports = {
  start,
  status,
  runCycle,
  fetchPythPrices,
  pickCryptoForTicker,
  PYTH_FEEDS,
}
