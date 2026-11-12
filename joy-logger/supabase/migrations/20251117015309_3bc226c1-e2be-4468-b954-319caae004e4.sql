-- Make journal-photos bucket private for security
UPDATE storage.buckets 
SET public = false 
WHERE id = 'journal-photos';

-- Drop existing policies if they exist to recreate them
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can view own photos" ON storage.objects;
  DROP POLICY IF EXISTS "Users can upload own photos" ON storage.objects;
  DROP POLICY IF EXISTS "Users can delete own photos" ON storage.objects;
EXCEPTION WHEN undefined_object THEN 
  NULL;
END $$;

-- Add RLS policies for storage.objects
-- Users can only access their own photos
CREATE POLICY "Users can view own photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'journal-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'journal-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'journal-photos' AND auth.uid()::text = (storage.foldername(name))[1]);