-- URGENT FIX: Run this in Supabase SQL Editor RIGHT NOW
-- This will fix the constraint issue immediately

-- Drop the constraint (works even if name is different)
ALTER TABLE holdings DROP CONSTRAINT IF EXISTS holdings_type_check;
ALTER TABLE holdings DROP CONSTRAINT IF EXISTS holdings_type_check1;
ALTER TABLE holdings DROP CONSTRAINT IF EXISTS holdings_type_check2;

-- Also try to drop any constraint on the type column
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    FOR constraint_record IN 
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'holdings'::regclass
        AND contype = 'c'
        AND conkey::int[] = ARRAY(
            SELECT attnum 
            FROM pg_attribute 
            WHERE attrelid = 'holdings'::regclass 
            AND attname = 'type'
        )
    LOOP
        EXECUTE 'ALTER TABLE holdings DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_record.conname);
    END LOOP;
END $$;

-- Add new constraint with ALL types
ALTER TABLE holdings 
ADD CONSTRAINT holdings_type_check 
CHECK (type IN (
    'stock', 'crypto', 'roth_ira', 'cash', 'hysa', 'bank', 
    'home_equity', 'other', 'etf', 'bond', '401k', '529', 
    'child_roth', 'hsa', 'traditional_ira', 'sep_ira'
));

-- Verify it worked
SELECT '✅ CONSTRAINT FIXED! You can now add HYSA and all other asset types.' AS status;


