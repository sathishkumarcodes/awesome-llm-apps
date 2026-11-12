-- Create storage bucket for journal photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('journal-photos', 'journal-photos', true);

-- Add photo_url column to journal_entries
ALTER TABLE public.journal_entries
ADD COLUMN photo_url TEXT;

-- Create RLS policies for journal-photos bucket
CREATE POLICY "Users can view their own journal photos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'journal-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can upload their own journal photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'journal-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own journal photos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'journal-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own journal photos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'journal-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);