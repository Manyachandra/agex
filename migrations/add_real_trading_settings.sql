-- Admin-controllable real on-chain trading settings (stored on the single
-- settings row, id = 1). These mirror the REAL_TRADE_* env vars; the env values
-- are only used as fallback defaults when a column is null.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS real_trading_enabled        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS real_trade_max_eth          numeric DEFAULT 0.001,
  ADD COLUMN IF NOT EXISTS real_trade_gas_buffer_eth   numeric DEFAULT 0.0002,
  ADD COLUMN IF NOT EXISTS real_trade_max_agents       integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS real_trade_min_usd          numeric DEFAULT 2,
  ADD COLUMN IF NOT EXISTS real_trade_sell_probability numeric DEFAULT 0.35,
  ADD COLUMN IF NOT EXISTS real_trade_slippage         numeric DEFAULT 0.08,
  ADD COLUMN IF NOT EXISTS real_trade_interval_ms      integer DEFAULT 600000,
  ADD COLUMN IF NOT EXISTS real_trade_fee_pct          numeric DEFAULT 0.02,
  ADD COLUMN IF NOT EXISTS real_trade_take_profit_pct  numeric DEFAULT 15,
  ADD COLUMN IF NOT EXISTS real_trade_stop_loss_pct    numeric DEFAULT 20;

-- Seed the existing row with defaults where null.
UPDATE settings
SET real_trading_enabled        = COALESCE(real_trading_enabled, false),
    real_trade_max_eth          = COALESCE(real_trade_max_eth, 0.001),
    real_trade_gas_buffer_eth   = COALESCE(real_trade_gas_buffer_eth, 0.0002),
    real_trade_max_agents       = COALESCE(real_trade_max_agents, 5),
    real_trade_min_usd          = COALESCE(real_trade_min_usd, 2),
    real_trade_sell_probability = COALESCE(real_trade_sell_probability, 0.35),
    real_trade_slippage         = COALESCE(real_trade_slippage, 0.08),
    real_trade_interval_ms      = COALESCE(real_trade_interval_ms, 600000),
    real_trade_fee_pct          = COALESCE(real_trade_fee_pct, 0.02),
    real_trade_take_profit_pct  = COALESCE(real_trade_take_profit_pct, 15),
    real_trade_stop_loss_pct    = COALESCE(real_trade_stop_loss_pct, 20)
WHERE id = 1;
