-- Real on-chain trade fees are small fractional USD amounts (e.g. a 2% fee on a
-- ~$3 trade ≈ $0.06). The original treasury/activity money columns were created
-- as INTEGER (for the old whole-dollar USD simulation), so fractional values
-- truncate to 0. Convert them to numeric so collected fees accumulate correctly.

ALTER TABLE treasury
  ALTER COLUMN total_fees      TYPE numeric USING total_fees::numeric,
  ALTER COLUMN exchange_wallet TYPE numeric USING exchange_wallet::numeric;

ALTER TABLE activity
  ALTER COLUMN amount TYPE numeric USING amount::numeric;
