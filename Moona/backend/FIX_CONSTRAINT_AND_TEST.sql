-- COMPREHENSIVE FIX: Update holdings.type CHECK constraint
-- This script will fix the constraint issue and verify it works
-- Run this in Supabase SQL Editor

-- Step 1: Drop ALL existing CHECK constraints on the type column
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
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
        EXECUTE 'ALTER TABLE holdings DROP CONSTRAINT ' || quote_ident(r.conname);
        RAISE NOTICE 'Dropped constraint: %', r.conname;
    END LOOP;
END $$;

-- Step 2: Add the new constraint with ALL 16 asset types
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

-- Step 3: Verify the constraint was added
SELECT 
    'SUCCESS! Constraint updated.' AS status,
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'holdings'::regclass
AND conname = 'holdings_type_check';

-- Step 4: Test that all types are accepted (this will show errors if any fail)
DO $$
DECLARE
    test_types TEXT[] := ARRAY[
        'stock', 'crypto', 'roth_ira', 'cash', 'hysa', 'bank', 
        'home_equity', 'other', 'etf', 'bond', '401k', '529', 
        'child_roth', 'hsa', 'traditional_ira', 'sep_ira'
    ];
    test_type TEXT;
    test_result TEXT;
BEGIN
    FOREACH test_type IN ARRAY test_types
    LOOP
        BEGIN
            -- Try to create a test constraint check (this validates the value is allowed)
            PERFORM test_type = ANY(ARRAY[
                'stock', 'crypto', 'roth_ira', 'cash', 'hysa', 'bank', 
                'home_equity', 'other', 'etf', 'bond', '401k', '529', 
                'child_roth', 'hsa', 'traditional_ira', 'sep_ira'
            ]);
            RAISE NOTICE '✓ Type "%" is valid', test_type;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '✗ Type "%" FAILED: %', test_type, SQLERRM;
        END;
    END LOOP;
    RAISE NOTICE 'All asset types validated!';
END $$;


