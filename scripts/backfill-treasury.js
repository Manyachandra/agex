// One-time backfill: reconcile the treasury row with historical trades.
// The treasury table was empty while 122 trades accrued, so total_fees /
// total_trades were never recorded. Run once: `node scripts/backfill-treasury.js`.

const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  realtime: { transport: ws },
});

(async () => {
  const { data: trades, error: tErr } = await supabase.from('trades').select('fee');
  if (tErr) { console.error('trades fetch error:', tErr.message); process.exit(1); }

  const totalTrades = trades.length;
  const totalFees = parseFloat(trades.reduce((s, t) => s + (parseFloat(t.fee) || 0), 0).toFixed(4));

  let treasury = (await supabase.from('treasury').select('*').maybeSingle()).data;
  if (!treasury) {
    const ins = await supabase.from('treasury').insert({
      total_fees: 0, total_trades: 0, total_tasks: 0, exchange_wallet: 0, updated_at: new Date(),
    }).select().single();
    treasury = ins.data;
  }

  const { data: updated, error: uErr } = await supabase.from('treasury').update({
    total_trades: totalTrades,
    total_fees: totalFees,
    exchange_wallet: totalFees,
    updated_at: new Date(),
  }).eq('id', treasury.id).select().single();

  if (uErr) { console.error('treasury update error:', uErr.message); process.exit(1); }
  console.log('Treasury backfilled:', JSON.stringify(updated));
  process.exit(0);
})();
