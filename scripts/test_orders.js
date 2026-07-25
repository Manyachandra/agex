// Dry-run test of all order paths WITHOUT spending real ETH.
//
//  1. retry wrapper recovers transient RPC errors (mock)
//  2. BUY feasibility: real trending tokens produce a usable V3 quote
//  3. SELL quote: quoteSellEth returns live ETH value
//  4. DECISION MATRIX: replicates the exact buy/sell/TP/SL booleans from
//     realTradingEngine.runCycle and asserts the right action is chosen
require('dotenv').config()
const { ethers } = require('ethers')
const realTrader = require('../services/realTrader')
const trending = require('../services/trendingTokens')

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name} ${extra}`) }
  else { fail++; console.log(`  ❌ ${name} ${extra}`) }
}

// Mirror the engine's sell-vs-buy decision so we can unit-test the thresholds.
function decide({ cfg, canBuy, canSell, bestPct, worstPct, rand }) {
  const hitsTakeProfit = !!(canSell && cfg.takeProfitPct > 0 && bestPct >= cfg.takeProfitPct)
  const hitsStopLoss = !!(canSell && cfg.stopLossPct > 0 && worstPct <= -cfg.stopLossPct)
  let sellReason = null
  if (hitsStopLoss) sellReason = 'STOP-LOSS'
  else if (hitsTakeProfit) sellReason = 'TAKE-PROFIT'
  const wantSell = canSell && (sellReason !== null || !canBuy || rand < cfg.sellProbability)
  if (!canBuy && !canSell) return { action: 'SKIP', sellReason }
  return { action: wantSell ? 'SELL' : 'BUY', sellReason }
}

async function main() {
  const cfg = {
    takeProfitPct: 15, stopLossPct: 20, sellProbability: 0.35,
    minUsd: 2, slippage: 0.08,
  }

  console.log('\n[1] withRetry recovers a transient RPC error')
  let calls = 0
  const recovered = await realTrader.withRetry(async () => {
    calls++
    if (calls < 2) { const e = new Error('missing revert data'); e.code = 'CALL_EXCEPTION'; throw e }
    return 'ok'
  }, { tries: 3, delayMs: 10 })
  check('retries transient CALL_EXCEPTION then succeeds', recovered === 'ok' && calls === 2, `(calls=${calls})`)

  let threw = false
  try {
    await realTrader.withRetry(async () => { const e = new Error('execution reverted: bad'); e.code = 'OTHER'; throw e }, { tries: 3, delayMs: 10 })
  } catch { threw = true }
  check('does NOT retry a non-transient error', threw)

  console.log('\n[2] BUY feasibility against real trending tokens')
  const tokens = await trending.fetchTrendingTokens().catch(() => [])
  check('fetched trending tokens', tokens.length > 0, `(${tokens.length} tokens)`)
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  let buyable = 0
  let roundTrippable = null
  const sample = tokens.slice(0, 4)
  for (const t of sample) {
    await sleep(600) // pace calls so the public RPC doesn't rate-limit the probe
    const meta = await realTrader.getTokenMeta(t.tokenAddress)
    const q = await realTrader.bestQuote(realTrader.WETH, t.tokenAddress, ethers.parseEther('0.001')).catch(() => null)
    if (!q) { console.log(`     ${meta.symbol}: no V3 buy pool`); continue }
    buyable++
    // Can we also sell what we'd buy? (filters honeypot / one-directional tokens)
    await sleep(600)
    const tokensFromBuy = parseFloat(ethers.formatUnits(q.amountOut, meta.decimals))
    const sellEth = await realTrader.quoteSellEth(t.tokenAddress, tokensFromBuy)
    const sellable = sellEth > 0
    if (sellable && !roundTrippable) roundTrippable = { ...t, meta, tokensFromBuy, sellEth }
    console.log(`     ${meta.symbol}: buy fee ${q.fee}, +${tokensFromBuy.toFixed(2)} | sell ${sellable ? sellEth + ' ETH' : 'NOT sellable (honeypot?)'}`)
  }
  check('at least one sampled token is buyable', buyable > 0, `(${buyable}/${sample.length})`)
  check('at least one sampled token round-trips (buy+sell)', !!roundTrippable)

  console.log('\n[3] SELL quote (quoteSellEth) on a round-trippable token')
  if (roundTrippable) {
    check('getTokenMeta returns decimals+symbol', roundTrippable.meta.symbol != null, `(${roundTrippable.meta.symbol}, ${roundTrippable.meta.decimals}d)`)
    check('quoteSellEth returns a positive ETH value', roundTrippable.sellEth > 0,
      `(buy 0.001 ETH -> ${roundTrippable.tokensFromBuy.toFixed(2)} ${roundTrippable.meta.symbol} -> sell ${roundTrippable.sellEth} ETH)`) 
  } else {
    check('round-trippable token available for sell test', false, '(none in sample)')
  }

  console.log('\n[4] DECISION MATRIX (buy / sell / take-profit / stop-loss)')
  // stop-loss beats everything, even when the agent could buy
  check('STOP-LOSS forces sell over buy',
    decide({ cfg, canBuy: true, canSell: true, bestPct: 5, worstPct: -25, rand: 0.99 }).sellReason === 'STOP-LOSS')
  // take-profit forces a sell when up enough, even with buy power
  check('TAKE-PROFIT forces sell over buy',
    decide({ cfg, canBuy: true, canSell: true, bestPct: 18, worstPct: 18, rand: 0.99 }).sellReason === 'TAKE-PROFIT')
  // stop-loss has priority over take-profit when both trigger
  check('STOP-LOSS beats TAKE-PROFIT',
    decide({ cfg, canBuy: true, canSell: true, bestPct: 30, worstPct: -30, rand: 0.99 }).sellReason === 'STOP-LOSS')
  // rich-in-tokens but low ETH (can't buy) -> still sells
  check('low ETH + tokens -> SELL (liquidate)',
    decide({ cfg, canBuy: false, canSell: true, bestPct: 2, worstPct: 2, rand: 0.99 }).action === 'SELL')
  // healthy ETH, no TP/SL, unlucky roll -> BUY
  check('no TP/SL, rand above sellProbability -> BUY',
    decide({ cfg, canBuy: true, canSell: true, bestPct: 3, worstPct: -3, rand: 0.9 }).action === 'BUY')
  // healthy ETH, no TP/SL, lucky roll -> probabilistic SELL
  check('no TP/SL, rand below sellProbability -> SELL',
    decide({ cfg, canBuy: true, canSell: true, bestPct: 3, worstPct: -3, rand: 0.1 }).action === 'SELL')
  // no funds and no tokens -> SKIP
  check('no buy power + no tokens -> SKIP',
    decide({ cfg, canBuy: false, canSell: false, bestPct: 0, worstPct: 0, rand: 0.5 }).action === 'SKIP')
  // TP disabled (0) -> does not trigger
  check('takeProfitPct=0 disables take-profit',
    decide({ cfg: { ...cfg, takeProfitPct: 0 }, canBuy: true, canSell: true, bestPct: 50, worstPct: 50, rand: 0.99 }).sellReason === null)
  // SL disabled (0) -> does not trigger
  check('stopLossPct=0 disables stop-loss',
    decide({ cfg: { ...cfg, stopLossPct: 0 }, canBuy: true, canSell: true, bestPct: -50, worstPct: -50, rand: 0.99 }).sellReason === null)

  console.log(`\n──────── ${pass} passed, ${fail} failed ────────\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(e => { console.error('Harness crashed:', e); process.exit(1) })
