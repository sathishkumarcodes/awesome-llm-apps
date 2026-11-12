-- Add tags column to journal_entries table
ALTER TABLE public.journal_entries 
ADD COLUMN tags TEXT[] DEFAULT '{}';

-- Create index for better tag query performance
CREATE INDEX idx_journal_entries_tags ON public.journal_entries USING GIN(tags);

-- Add comment for documentation
COMMENT ON COLUMN public.journal_entries.tags IS 'Array of theme tags for categorizing entries (e.g., Family, Baby, Calm, Nature, Gratitude, Personal Win, Work, Health)';