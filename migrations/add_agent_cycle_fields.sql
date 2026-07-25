-- Run this in Supabase SQL Editor to add dynamic engine fields to agents table
-- Dashboard: https://app.supabase.com → SQL Editor

-- Cycle tracking fields
ALTER TABLE agents ADD COLUMN IF NOT EXISTS cycle_count integer DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_cycle_at timestamptz;

-- Enhanced bankruptcy fields
ALTER TABLE agents ADD COLUMN IF NOT EXISTS final_price numeric;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS bankrupt_at timestamptz;
