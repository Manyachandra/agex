-- Add user_id and connected_at columns to user_wallets table
ALTER TABLE user_wallets ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE user_wallets ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ DEFAULT NOW();

-- Create unique index so one user can only have one wallet
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_wallets_user_id ON user_wallets(user_id);

-- RLS policies for user_wallets
ALTER TABLE user_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read wallets" ON user_wallets FOR SELECT USING (true);
CREATE POLICY "Users can insert own wallet" ON user_wallets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own wallet" ON user_wallets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own wallet" ON user_wallets FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for bets table
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read bets" ON bets FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert bets" ON bets FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can manage bets" ON bets FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Add tx_hash and user_id to bets if not present
ALTER TABLE bets ADD COLUMN IF NOT EXISTS tx_hash TEXT;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE bets ADD COLUMN IF NOT EXISTS payout_tx_hash TEXT;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS agent_price_at_bet NUMERIC;
