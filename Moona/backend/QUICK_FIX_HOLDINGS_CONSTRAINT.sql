-- QUICK FIX: Update holdings.type CHECK constraint
-- Copy and paste this entire script into Supabase SQL Editor and run it

-- Method 1: Try dropping by common constraint names
ALTER TABLE holdings DROP CONSTRAINT IF EXISTS holdings_type_check;
ALTER TABLE holdings DROP CONSTRAINT IF EXISTS holdings_type_check1;
ALTER TABLE holdings DROP CONSTRAINT IF EXISTS holdings_type_check2;

-- Method 2: Drop ALL CHECK constraints on the type column (more aggressive)
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

-- Now add the new constraint with ALL asset types
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

-- Verify it worked
SELECT 
    'SUCCESS! Constraint updated.' AS status,
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'holdings'::regclass
AND conname = 'holdings_type_check';


