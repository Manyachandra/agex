-- ============================================================================
-- PRODUCTION CLEANUP
-- ============================================================================
-- Wipes all agent / exchange / activity data to give a clean slate for launch.
--
-- KEEPS:   profiles (user accounts / Supabase Auth)
-- RESETS:  settings -> defaults, treasury -> zero
-- WIPES:   agents and ALL data derived from them, plus agent_suggestions
--
-- ⚠️  THIS IS IRREVERSIBLE. Take a Supabase backup/snapshot first.
-- Run the whole script at once in the Supabase SQL editor.
-- ============================================================================

BEGIN;

-- ── Agent-derived / exchange data ───────────────────────────────────────────
TRUNCATE TABLE
  activity,
  trades,
  price_history,
  bets,
  user_wallets,
  social_posts,
  agent_fund_history,
  agent_token_trades,
  predictions,
  agent_suggestions
RESTART IDENTITY;

-- Legacy table (present in older schemas). Ignore if it doesn't exist.
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tweets') THEN
    EXECUTE 'TRUNCATE TABLE tweets RESTART IDENTITY';
  END IF;
END $$;

-- ── Agents last (other tables reference it) ─────────────────────────────────
TRUNCATE TABLE agents RESTART IDENTITY CASCADE;

-- ── Reset treasury to zero ──────────────────────────────────────────────────
UPDATE treasury
SET total_fees = 0,
    total_trades = 0,
    total_tasks = 0,
    exchange_wallet = 0,
    updated_at = now()
WHERE true;  -- single-row table; resets the treasury row

-- ── Reset platform settings to defaults ─────────────────────────────────────
UPDATE settings
SET exchange_cycle_interval = 10,
    task_cycle_interval     = 15,
    trade_fee               = 2,
    dominant_multiplier     = 1.5,
    allow_agent_suggestions = true,
    dashboard_refresh_rate  = 30,
    free_agent_registration = false,
    -- Real on-chain trading: OFF + safe defaults until prod wallets are funded.
    real_trading_enabled        = false,
    real_trade_max_eth          = 0.001,
    real_trade_gas_buffer_eth   = 0.0002,
    real_trade_max_agents       = 5,
    real_trade_min_usd          = 2,
    real_trade_sell_probability = 0.35,
    real_trade_slippage         = 0.08,
    real_trade_interval_ms      = 600000,
    real_trade_fee_pct          = 0.02,
    real_trade_take_profit_pct  = 15,
    real_trade_stop_loss_pct    = 20,
    updated_at              = now()
WHERE id = 1;

COMMIT;

-- ── Sanity check (run after commit) ─────────────────────────────────────────
-- SELECT 'agents' t, count(*) FROM agents
-- UNION ALL SELECT 'trades', count(*) FROM trades
-- UNION ALL SELECT 'activity', count(*) FROM activity
-- UNION ALL SELECT 'bets', count(*) FROM bets
-- UNION ALL SELECT 'social_posts', count(*) FROM social_posts
-- UNION ALL SELECT 'agent_token_trades', count(*) FROM agent_token_trades
-- UNION ALL SELECT 'profiles (kept)', count(*) FROM profiles
-- UNION ALL SELECT 'real_trading_enabled', real_trading_enabled::text FROM settings WHERE id = 1;
