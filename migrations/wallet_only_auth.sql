-- Wallet-only identity: profiles and agent ownership keyed by wallet address (text).
-- Run in Supabase SQL editor (service role / dashboard).
--
-- Policies that reference profiles.id must be dropped before ALTER TYPE.

-- ── 1. Drop dependent RLS policies (betting is unused; agent/profile policies recreated below)
DROP POLICY IF EXISTS "Admin can manage bets" ON public.bets;
DROP POLICY IF EXISTS "Public read bets" ON public.bets;
DROP POLICY IF EXISTS "Authenticated users can insert bets" ON public.bets;

DROP POLICY IF EXISTS "Admin full access agents" ON public.agents;
DROP POLICY IF EXISTS "Auth users insert agents" ON public.agents;
DROP POLICY IF EXISTS "Public read agents" ON public.agents;
DROP POLICY IF EXISTS "Users can read own agents" ON public.agents;
DROP POLICY IF EXISTS "Users can insert agents" ON public.agents;
DROP POLICY IF EXISTS "Admin can manage all agents" ON public.agents;
DROP POLICY IF EXISTS "Allow public read" ON public.agents;
DROP POLICY IF EXISTS "Allow public insert" ON public.agents;

DROP POLICY IF EXISTS "Users can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

DROP POLICY IF EXISTS "Users can update own wallet" ON public.user_wallets;
DROP POLICY IF EXISTS "Users can insert own wallet" ON public.user_wallets;
DROP POLICY IF EXISTS "Users can delete own wallet" ON public.user_wallets;
DROP POLICY IF EXISTS "Public read wallets" ON public.user_wallets;

-- ── 2. Drop auth.users FKs that block wallet keys
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_created_by_fkey;

-- ── 3. Allow wallet addresses as profile / ownership keys
ALTER TABLE public.profiles ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE public.agents ALTER COLUMN created_by TYPE text USING created_by::text;

-- Email is no longer required
ALTER TABLE public.profiles ALTER COLUMN email DROP NOT NULL;

-- Explicit wallet column (mirrors id for new users)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_address text;
UPDATE public.profiles SET wallet_address = lower(id) WHERE wallet_address IS NULL AND id LIKE '0x%';
CREATE UNIQUE INDEX IF NOT EXISTS profiles_wallet_address_lower_idx
  ON public.profiles (lower(wallet_address))
  WHERE wallet_address IS NOT NULL;

-- Optional: drop auth trigger if present
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Fund history ownership keyed by wallet when present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agent_fund_history'
  ) THEN
    ALTER TABLE public.agent_fund_history DROP CONSTRAINT IF EXISTS agent_fund_history_user_id_fkey;
    ALTER TABLE public.agent_fund_history ALTER COLUMN user_id TYPE text USING user_id::text;
  END IF;
END $$;

-- ── 4. Recreate simple policies (backend uses service_role; public read for desk)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read all profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (true);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access agents" ON public.agents;
DROP POLICY IF EXISTS "Owners update own agents" ON public.agents;
CREATE POLICY "Public read agents" ON public.agents FOR SELECT USING (true);
CREATE POLICY "Auth users insert agents" ON public.agents FOR INSERT WITH CHECK (true);
CREATE POLICY "Owners update own agents" ON public.agents FOR UPDATE USING (
  created_by IS NOT NULL AND lower(created_by) = lower(coalesce(auth.jwt() ->> 'wallet', auth.uid()::text))
);
