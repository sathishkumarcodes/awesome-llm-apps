-- Remove CHECK constraint on holdings.type column
-- Run this in Supabase SQL Editor

-- Step 1: Drop the constraint by common names
ALTER TABLE holdings DROP CONSTRAINT IF EXISTS holdings_type_check;
ALTER TABLE holdings DROP CONSTRAINT IF EXISTS holdings_type_check1;
ALTER TABLE holdings DROP CONSTRAINT IF EXISTS holdings_type_check2;

-- Step 2: Find and drop ALL CHECK constraints on the type column
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
        RAISE NOTICE 'Dropped constraint: %', constraint_record.conname;
    END LOOP;
END $$;

-- Step 3: Verify no constraints remain on type column
SELECT 
    '✅ CONSTRAINT REMOVED!' AS status,
    COUNT(*) AS remaining_constraints
FROM pg_constraint
WHERE conrelid = 'holdings'::regclass
AND contype = 'c'
AND conkey::int[] = ARRAY(
    SELECT attnum 
    FROM pg_attribute 
    WHERE attrelid = 'holdings'::regclass 
    AND attname = 'type'
);

-- If the query returns 0, the constraint has been successfully removed!


