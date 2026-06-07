// Verify the sell-selection logic with TEST's real holdings shape, using a
// mocked quoteSellEth so it's deterministic and spends nothing.
require('dotenv').config()
const realTrader = require('../services/realTrader')
const engine = require('../services/realTradingEngine')

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name} ${extra}`) }
  else { fail++; console.log(`  ❌ ${name} ${extra}`) }
}

// Mirror of TEST's wallet: 4 sellable tokens + 1 illiquid bag (0 quote).
const holdings = {
  '0xvirtual': { symbol: 'VIRTUAL', decimals: 18, amount: 5.76, eth_in: 0.002 },
  '0xdegen':   { symbol: 'DEGEN',   decimals: 18, amount: 3007, eth_in: 0.00289884 },
  '0xvvv':     { symbol: 'VVV',     decimals: 18, amount: 0.082, eth_in: 0.00083627 },
  '0xc52a':    { symbol: 'BIGBAG',  decimals: 18, amount: 45465, eth_in: 0.001 }, // NO sell pool
}

// Mocked live ETH values (what quoteSellEth would return on-chain):
//  VIRTUAL +0.3%, DEGEN -3%, VVV ~flat, BIGBAG = 0 (illiquid/honeypot)
const liveEth = {
  '0xvirtual': 0.002006,
  '0xdegen':   0.002812,
  '0xvvv':     0.000832,
  '0xc52a':    0, // unsellable
}

async function main() {
  const orig = realTrader.quoteSellEth
  realTrader.quoteSellEth = async (key) => liveEth[key] ?? 0

  const r = await engine.evaluateHoldings(holdings)
  realTrader.quoteSellEth = orig

  console.log('\n[sell selection on TEST-like holdings]')
  const sellableKeys = r.sellable.map(p => p.h.symbol)
  check('illiquid BIGBAG excluded from sellable', !sellableKeys.includes('BIGBAG'), `(sellable: ${sellableKeys.join(', ')})`)
  check('all 3 liquid tokens are sellable', r.sellable.length === 3)
  check('sellable list is profit-descending', r.sellable[0].profit >= r.sellable[r.sellable.length - 1].profit)
  check('best is the most profitable SELLABLE position', r.best && r.best.h.symbol === 'VIRTUAL', `(best=${r.best?.h.symbol}, ${r.best?.profit >= 0 ? '+' : ''}${r.best?.profit.toFixed(6)} ETH)`)
  check('worst is NOT the illiquid bag', r.worst && r.worst.h.symbol !== 'BIGBAG', `(worst=${r.worst?.h.symbol}, ${r.worst?.profitPct.toFixed(1)}%)`)
  check('BIGBAG would have falsely shown -100% if not filtered',
    r.positions.find(p => p.h.symbol === 'BIGBAG').profitPct === -100)

  console.log(`\n──────── ${pass} passed, ${fail} failed ────────\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
