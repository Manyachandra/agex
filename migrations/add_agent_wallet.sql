-- Each agent gets its own real EVM wallet on Base.
-- wallet_address: public address (safe to expose).
-- wallet_private_key: encrypted private key (NEVER exposed via API).

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS wallet_address text;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS wallet_private_key text;

CREATE INDEX IF NOT EXISTS idx_agents_wallet_address ON agents (wallet_address);
