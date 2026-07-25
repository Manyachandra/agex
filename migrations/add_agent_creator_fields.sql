-- Add creator fields to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS creator_name text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS creator_twitter text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Drop existing conflicting policies if any (safe to run multiple times)
DROP POLICY IF EXISTS "Users can read own agents" ON agents;
DROP POLICY IF EXISTS "Users can insert agents" ON agents;
DROP POLICY IF EXISTS "Admin can manage all agents" ON agents;
DROP POLICY IF EXISTS "Admin full access agents" ON agents;
DROP POLICY IF EXISTS "Owners update own agents" ON agents;
DROP POLICY IF EXISTS "Allow public read" ON agents;
DROP POLICY IF EXISTS "Allow public insert" ON agents;
DROP POLICY IF EXISTS "Public read agents" ON agents;
DROP POLICY IF EXISTS "Auth users insert agents" ON agents;

-- Enable RLS on agents (idempotent)
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Everyone can read all agents (for leaderboard, profiles, etc.)
CREATE POLICY "Public read agents" ON agents
  FOR SELECT USING (true);

-- Authenticated users can insert agents
CREATE POLICY "Auth users insert agents" ON agents
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Owners can update their own agents
CREATE POLICY "Owners update own agents" ON agents
  FOR UPDATE USING (auth.uid() IS NOT NULL AND created_by = auth.uid());

-- Service role (backend) can update agents regardless
-- This is automatically handled by service_role key
