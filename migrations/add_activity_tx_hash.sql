-- Adds an on-chain transaction hash to activity rows so the Activity feed can
-- link real on-chain trades to their BaseScan transaction page.
ALTER TABLE activity ADD COLUMN IF NOT EXISTS tx_hash text;
