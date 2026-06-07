// Wallet balances cache
//
// Fetching each agent's on-chain balance per request would be far too slow, so
// this service refreshes every agent's real Base wallet balance in the
// background and keeps it in memory. The native ETH balance is converted to USD
// using Pyth's live ETH price (reused from the Hermes engine).
//
// `decorate()` is then used wherever agents are returned over the API: it strips
// the private key AND overwrites the legacy simulated `wallet` field with the
// agent's REAL on-chain USD balance, so every page across the site shows real
// money instead of the old fixed value.

const { ethers } = require('ethers')
const agentWallet = require('./agentWallet')
const hermesEngine = require('./hermesEngine')

// ticker -> { eth, usd, address, updatedAt }
let cache = {}
let ethUsd = 0
let lastRefresh = null
let lastError = null

async function fetchEthUsd() {
  try {
    const prices = await hermesEngine.fetchPythPrices()
    if (prices?.ETH?.price && prices.ETH.price > 0) return prices.ETH.price
  } catch (e) {
    /* keep last known */
  }
  return ethUsd || 0
}

async function refreshAll(supabase) {
  try {
    const { data: agents, error } = await supabase
      .from('agents')
      .select('ticker, wallet_address')
    if (error) throw new Error(error.message)
    if (!agents) return

    ethUsd = await fetchEthUsd()
    const provider = agentWallet.getProvider()
    const next = { ...cache }

    const withWallet = agents.filter((a) => a.wallet_address)
    const CHUNK = 8 // throttle RPC concurrency
    for (let i = 0; i < withWallet.length; i += CHUNK) {
      const slice = withWallet.slice(i, i + CHUNK)
      await Promise.all(
        slice.map(async (a) => {
          try {
            const wei = await provider.getBalance(a.wallet_address)
            const eth = parseFloat(ethers.formatEther(wei))
            next[a.ticker] = {
              eth,
              usd: eth * ethUsd,
              address: a.wallet_address,
              updatedAt: Date.now(),
            }
          } catch (e) {
            // Keep previous cached value (if any) on transient RPC failure.
          }
        })
      )
    }

    // Agents without a wallet have a real balance of exactly zero.
    for (const a of agents) {
      if (!a.wallet_address) {
        next[a.ticker] = { eth: 0, usd: 0, address: null, updatedAt: Date.now() }
      }
    }

    cache = next
    lastRefresh = Date.now()
    lastError = null
  } catch (e) {
    lastError = e.message
    console.error('walletBalances.refreshAll error:', e.message)
  }
}

function getBalance(ticker) {
  return cache[ticker] || null
}

function getEthUsd() {
  return ethUsd
}

// Strip secrets and replace the simulated `wallet` with the REAL on-chain
// USD balance. Accepts a single agent or an array.
function decorate(agentOrArray) {
  if (!agentOrArray) return agentOrArray
  if (Array.isArray(agentOrArray)) return agentOrArray.map(decorate)
  const { wallet_private_key, ...safe } = agentOrArray
  const bal = cache[safe.ticker]
  const eth = bal ? bal.eth : 0
  const usd = bal ? bal.usd : 0
  return {
    ...safe,
    real_eth: eth,
    real_usd: usd,
    wallet: usd, // legacy field now reflects real money everywhere
  }
}

function start({ supabase, intervalMs }) {
  const ms = intervalMs || parseInt(process.env.WALLET_BALANCE_REFRESH_MS, 10) || 60000
  refreshAll(supabase)
  console.log(`💰 Wallet balance cache started (refresh every ${Math.round(ms / 1000)}s)`)
  return setInterval(() => refreshAll(supabase), ms)
}

function status() {
  return { ethUsd, lastRefresh, lastError, agents: Object.keys(cache).length }
}

module.exports = { start, refreshAll, getBalance, getEthUsd, decorate, status }
