-- Add creator fields to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS creator_name text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS creator_twitter text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Drop existing conflicting policies if any (safe to run multiple times)
DROP POLICY IF EXISTS "Users can read own agents" ON agents;
DROP POLICY IF EXISTS "Users can insert agents" ON agents;
DROP POLICY IF EXISTS "Admin can manage all agents" ON agents;
DROP POLICY IF EXISTS "Allow public read" ON agents;
DROP POLICY IF EXISTS "Allow public insert" ON agents;

-- Enable RLS on agents (idempotent)
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Everyone can read all agents (for leaderboard, profiles, etc.)
CREATE POLICY "Public read agents" ON agents
  FOR SELECT USING (true);

-- Authenticated users can insert agents
CREATE POLICY "Auth users insert agents" ON agents
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Admin can do everything on agents
CREATE POLICY "Admin full access agents" ON agents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Service role (backend) can update agents regardless
-- This is automatically handled by service_role key
