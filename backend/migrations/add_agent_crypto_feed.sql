-- Adds the cryptocurrency feed each agent tracks via Pyth (Hermes).
-- Existing rows are left as NULL; the Hermes engine assigns one deterministically
-- from the agent's ticker the first time it sees the agent.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS crypto_symbol text;

CREATE INDEX IF NOT EXISTS idx_agents_crypto_symbol ON agents (crypto_symbol);
