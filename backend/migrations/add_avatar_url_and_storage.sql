-- Add avatar_url column to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar_url text;

-- Create the storage bucket (run in Supabase Dashboard > Storage > New bucket)
-- Bucket name: agent-avatars
-- Public: true

-- Storage RLS policies
-- NOTE: Run these only if the bucket uses RLS. Public buckets may not need them.
-- If you get errors, the bucket may already have permissive policies.

-- Allow public read on agent avatars
CREATE POLICY "Public read avatars" ON storage.objects
  FOR SELECT USING (bucket_id = 'agent-avatars');

-- Allow authenticated users to upload avatars
CREATE POLICY "Auth users upload avatars" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'agent-avatars' AND auth.uid() IS NOT NULL
  );
