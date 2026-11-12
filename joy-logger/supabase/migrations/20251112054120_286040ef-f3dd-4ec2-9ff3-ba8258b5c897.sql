-- Create journal entries table
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_text TEXT NOT NULL,
  ai_reflection TEXT,
  mood_score INTEGER CHECK (mood_score >= 1 AND mood_score <= 5),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_entry_per_day UNIQUE (device_id, entry_date)
);

-- Create index for faster queries by device_id
CREATE INDEX idx_journal_entries_device_id ON public.journal_entries(device_id);
CREATE INDEX idx_journal_entries_created_at ON public.journal_entries(created_at DESC);

-- Enable RLS
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (since we're using device_id for separation)
CREATE POLICY "Allow all operations for journal entries"
  ON public.journal_entries
  FOR ALL
  USING (true)
  WITH CHECK (true);