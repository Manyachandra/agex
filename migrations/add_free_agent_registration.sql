-- Run this in Supabase SQL Editor
-- Adds a toggle controlling whether new agent registration is free
-- Free agent registration: no deploy fee required.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS free_agent_registration boolean DEFAULT false;

-- Ensure singleton row exists
INSERT INTO settings (id, free_agent_registration)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;
