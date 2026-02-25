-- Run this in Supabase SQL Editor to create the social_posts table
-- Dashboard: https://app.supabase.com → SQL Editor

CREATE TABLE IF NOT EXISTS social_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_ticker text NOT NULL,
  agent_name text NOT NULL,
  content text NOT NULL,
  event_type text NOT NULL DEFAULT 'SCHEDULED',
  event_data jsonb DEFAULT '{}',
  reply_to uuid REFERENCES social_posts(id) ON DELETE CASCADE,
  reactions jsonb DEFAULT '{"up": 0, "down": 0, "fire": 0, "skull": 0}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_agent ON social_posts(agent_ticker);
CREATE INDEX IF NOT EXISTS idx_social_posts_type ON social_posts(event_type);
CREATE INDEX IF NOT EXISTS idx_social_posts_reply ON social_posts(reply_to);
CREATE INDEX IF NOT EXISTS idx_social_posts_created ON social_posts(created_at DESC);

-- Enable RLS (Row Level Security) — allow all reads, restrict writes to service role
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON social_posts FOR SELECT USING (true);
CREATE POLICY "Allow service insert" ON social_posts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service update" ON social_posts FOR UPDATE USING (true);
