// ETH/USD from GeckoTerminal (Robinhood Chain WETH).
// Replaces the old Pyth/Hermes simulation price feed.

const axios = require('axios')

const GECKO_BASE = 'https://api.geckoterminal.com/api/v2'
const NETWORK = (process.env.TRENDING_NETWORK || 'robinhood').trim()
const WETH = (process.env.WETH_ADDRESS || '').toLowerCase()

let cached = 0
let cachedAt = 0
const CACHE_TTL = 60 * 1000 // 1 min

async function fetchEthUsd() {
  const now = Date.now()
  if (cached > 0 && (now - cachedAt) < CACHE_TTL) return cached
  if (!WETH) return cached || 0

  try {
    const url = `${GECKO_BASE}/simple/networks/${encodeURIComponent(NETWORK)}/token_price/${WETH}`
    const r = await axios.get(url, {
      timeout: 10000,
      headers: { Accept: 'application/json;version=20230302' },
    })
    const prices = r.data?.data?.attributes?.token_prices || {}
    // Keys may be lowercased in the response.
    const raw = prices[WETH] ?? prices[Object.keys(prices)[0]]
    const n = parseFloat(raw)
    if (Number.isFinite(n) && n > 0) {
      cached = n
      cachedAt = now
      return cached
    }
  } catch (e) {
    console.warn('[ethPrice] GeckoTerminal fetch failed:', e.message)
  }
  return cached || 0
}

function getCachedEthUsd() {
  return cached
}

module.exports = { fetchEthUsd, getCachedEthUsd }
