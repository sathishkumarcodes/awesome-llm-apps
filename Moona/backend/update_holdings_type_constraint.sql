-- Migration: Update holdings.type CHECK constraint to include all asset types
-- Run this in Supabase SQL Editor

-- Step 1: Find and drop ALL existing CHECK constraints on the type column
-- PostgreSQL may have auto-named the constraint, so we need to find it by checking the column
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- Find the constraint on the type column
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'holdings'::regclass
    AND contype = 'c'
    AND conkey::int[] = ARRAY(
        SELECT attnum 
        FROM pg_attribute 
        WHERE attrelid = 'holdings'::regclass 
        AND attname = 'type'
    )
    LIMIT 1;
    
    -- Drop the constraint if found
    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE holdings DROP CONSTRAINT ' || quote_ident(constraint_name);
        RAISE NOTICE 'Dropped constraint: %', constraint_name;
    ELSE
        RAISE NOTICE 'No existing constraint found on type column';
    END IF;
END $$;

-- Step 2: Add the new constraint with all asset types
ALTER TABLE holdings 
ADD CONSTRAINT holdings_type_check 
CHECK (type IN (
    'stock', 
    'crypto', 
    'roth_ira',
    'cash',
    'hysa',
    'bank',
    'home_equity',
    'other',
    'etf',
    'bond',
    '401k',
    '529',
    'child_roth',
    'hsa',
    'traditional_ira',
    'sep_ira'
));

-- Step 3: Verify the constraint was added correctly
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'holdings'::regclass
AND conname = 'holdings_type_check';

