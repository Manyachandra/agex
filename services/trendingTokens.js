// Trending tokens
//
// Pulls trending pools from GeckoTerminal when TRENDING_NETWORK is set
// (e.g. "base", "eth", or whatever GeckoTerminal id Robinhood Chain gets).
// Until that env is set, returns an empty list so Base pools are never
// fetched after the Robinhood Chain cutover.

const axios = require('axios')

const GECKO_BASE = 'https://api.geckoterminal.com/api/v2'
const WETH = (process.env.WETH_ADDRESS || '').toLowerCase()
const TRENDING_NETWORK = (process.env.TRENDING_NETWORK || '').trim()
const EXCLUDED_SYMBOLS = new Set(['USDC', 'USDBC', 'USDT', 'DAI', 'EURC'])
const EXCLUDED_ADDRESSES = new Set(
  String(process.env.EXCLUDED_TOKEN_ADDRESSES || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
)

let cache = null
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 min

// Parse "network_0xabc..." token ids from GeckoTerminal relationships.
function addrFromId(id) {
  if (!id) return null
  const parts = String(id).split('_')
  return parts.length > 1 ? parts[1].toLowerCase() : String(id).toLowerCase()
}

async function fetchTrendingTokens() {
  if (!TRENDING_NETWORK) {
    // Do not fall back to networks/base after Robinhood Chain cutover.
    return []
  }
  if (!WETH) {
    console.warn('[trendingTokens] WETH_ADDRESS unset — cannot filter WETH-paired pools')
    return []
  }

  const now = Date.now()
  if (cache && (now - cacheTime) < CACHE_TTL) return cache

  const url = `${GECKO_BASE}/networks/${encodeURIComponent(TRENDING_NETWORK)}/trending_pools?include=base_token,quote_token,dex&page=1`
  const r = await axios.get(url, {
    timeout: 12000,
    headers: { Accept: 'application/json;version=20230302' },
  })

  const pools = r.data?.data || []
  const included = r.data?.included || []

  // Index included resources (tokens, dexes) by "type/id".
  const byKey = {}
  for (const inc of included) byKey[`${inc.type}/${inc.id}`] = inc

  const out = []
  for (const pool of pools) {
    try {
      const attrs = pool.attributes || {}
      const rel = pool.relationships || {}

      const baseId = rel.base_token?.data?.id
      const quoteId = rel.quote_token?.data?.id
      const dexId = rel.dex?.data?.id || ''

      const baseTok = byKey[`token/${baseId}`]
      const quoteTok = byKey[`token/${quoteId}`]

      const baseAddr = addrFromId(baseId)
      const quoteAddr = addrFromId(quoteId)

      // Only keep pools paired with WETH so we can swap ETH <-> token directly.
      let tokenAddr, tokenMeta, pairedIsWeth
      if (quoteAddr === WETH) {
        tokenAddr = baseAddr; tokenMeta = baseTok; pairedIsWeth = true
      } else if (baseAddr === WETH) {
        tokenAddr = quoteAddr; tokenMeta = quoteTok; pairedIsWeth = true
      } else {
        pairedIsWeth = false
      }
      if (!pairedIsWeth || !tokenAddr) continue
      const symbol = tokenMeta?.attributes?.symbol || '???'
      if (EXCLUDED_ADDRESSES.has(tokenAddr) || EXCLUDED_SYMBOLS.has(String(symbol).toUpperCase())) continue

      // Prefer Uniswap V3 pools (that's the router we use to swap).
      const isUniV3 = String(dexId).includes('uniswap') && String(dexId).includes('v3')

      out.push({
        tokenAddress: tokenAddr,
        symbol,
        name: tokenMeta?.attributes?.name || symbol || 'Unknown',
        poolAddress: addrFromId(pool.id),
        dex: dexId,
        isUniswapV3: isUniV3,
        priceUsd: parseFloat(attrs.base_token_price_usd || attrs.token_price_usd || 0) || null,
        volumeUsd24h: parseFloat(attrs.volume_usd?.h24 || 0) || null,
        priceChange24h: parseFloat(attrs.price_change_percentage?.h24 || 0) || null,
      })
    } catch (e) { /* skip malformed pool */ }
  }

  cache = out
  cacheTime = now
  return out
}

// Tokens we can actually swap (Uniswap V3, WETH-paired) — best first.
async function getSwappableTrending() {
  const all = await fetchTrendingTokens()
  return all.filter(t => t.isUniswapV3)
}

module.exports = { fetchTrendingTokens, getSwappableTrending, WETH_BASE: WETH, WETH }
