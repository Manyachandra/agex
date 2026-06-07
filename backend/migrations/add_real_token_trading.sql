-- Real on-chain token trading (agents swap ETH <-> trending Base tokens).

-- Per-agent real token holdings, e.g.
-- { "0xtoken": { "symbol": "PEPE", "decimals": 18, "amount": 123.4, "eth_in": 0.002 } }
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS token_holdings jsonb DEFAULT '{}'::jsonb;

-- Log of every real swap an agent makes.
CREATE TABLE IF NOT EXISTS agent_token_trades (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_ticker  text NOT NULL,
  side          text NOT NULL,            -- 'buy' | 'sell'
  token_address text NOT NULL,
  token_symbol  text,
  eth_amount    numeric,                  -- ETH spent (buy) or received (sell)
  token_amount  numeric,                  -- token bought/sold
  price_usd     numeric,
  tx_hash       text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_token_trades_ticker ON agent_token_trades (agent_ticker);
CREATE INDEX IF NOT EXISTS idx_agent_token_trades_created ON agent_token_trades (created_at DESC);
