// Execute production cleanup via Supabase service role (mirrors cleanup_for_production.sql).
// Wipes agent/exchange data, resets treasury + settings, keeps profiles.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

// Delete all rows (PostgREST requires a filter). Match every real row by PK type.
async function wipe(table, kind = 'uuid') {
  let q = supabase.from(table).delete({ count: 'exact' })
  if (kind === 'text') q = q.neq('ticker', '')
  else if (kind === 'bigint') q = q.gte('id', 0)
  else q = q.neq('id', NIL_UUID)
  const { error, count } = await q
  if (error) throw new Error(`${table}: ${error.message}`)
  return count ?? 0
}

async function main() {
  console.log('⚠️  PRODUCTION CLEANUP — irreversible. Starting in 3s…')
  await new Promise(r => setTimeout(r, 3000))

  const tables = [
    ['activity', 'uuid'], ['trades', 'uuid'], ['price_history', 'uuid'],
    ['bets', 'uuid'], ['user_wallets', 'uuid'], ['social_posts', 'uuid'],
    ['agent_fund_history', 'uuid'], ['agent_token_trades', 'bigint'],
    ['predictions', 'uuid'], ['agent_suggestions', 'uuid'],
  ]

  for (const [table, kind] of tables) {
    const n = await wipe(table, kind)
    console.log(`  wiped ${table}: ${n} row(s)`)
  }

  // agents last (other tables may reference ticker)
  const agentsN = await wipe('agents', 'text')
  console.log(`  wiped agents: ${agentsN} row(s)`)

  const { error: treErr } = await supabase.from('treasury').update({
    total_fees: 0,
    total_trades: 0,
    total_tasks: 0,
    exchange_wallet: 0,
    updated_at: new Date().toISOString(),
  }).neq('id', '00000000-0000-0000-0000-000000000000')
  if (treErr) throw new Error(`treasury: ${treErr.message}`)
  console.log('  reset treasury -> 0')

  const { error: setErr } = await supabase.from('settings').update({
    exchange_cycle_interval: 10,
    task_cycle_interval: 15,
    trade_fee: 2,
    dominant_multiplier: 1.5,
    allow_agent_suggestions: true,
    dashboard_refresh_rate: 30,
    free_agent_registration: false,
    real_trading_enabled: false,
    real_trade_max_eth: 0.001,
    real_trade_gas_buffer_eth: 0.0002,
    real_trade_max_agents: 5,
    real_trade_min_usd: 2,
    real_trade_sell_probability: 0.35,
    real_trade_slippage: 0.08,
    real_trade_interval_ms: 600000,
    real_trade_fee_pct: 0.02,
    real_trade_take_profit_pct: 15,
    real_trade_stop_loss_pct: 20,
    updated_at: new Date().toISOString(),
  }).eq('id', 1)
  if (setErr) throw new Error(`settings: ${setErr.message}`)
  console.log('  reset settings (real_trading_enabled=false)')

  // Sanity check
  const checks = ['agents', 'trades', 'activity', 'bets', 'social_posts', 'agent_token_trades', 'profiles']
  console.log('\nSanity check:')
  for (const t of checks) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true })
    if (error) console.log(`  ${t}: ERROR ${error.message}`)
    else console.log(`  ${t}: ${count}`)
  }
  const { data: settings } = await supabase.from('settings').select('real_trading_enabled').eq('id', 1).single()
  console.log(`  real_trading_enabled: ${settings?.real_trading_enabled}`)

  console.log('\n✅ Cleanup complete.')
  process.exit(0)
}

main().catch(e => { console.error('Cleanup failed:', e.message); process.exit(1) })
