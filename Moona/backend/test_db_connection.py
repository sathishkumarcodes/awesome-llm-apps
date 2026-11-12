#!/usr/bin/env python3
"""
Quick script to test Supabase connection and check if tables exist
"""
import asyncio
import sys
from db_supabase import get_db_pool, execute_query

async def check_tables():
    """Check if required tables exist"""
    try:
        pool = await get_db_pool()
        print("✅ Database connection successful!")
        print()
        
        # Check each required table
        required_tables = ['users', 'user_sessions', 'holdings', 'status_checks']
        
        print("Checking tables...")
        for table in required_tables:
            try:
                result = await execute_query(
                    f"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '{table}'"
                )
                if result:
                    print(f"  ✅ {table} table exists")
                else:
                    print(f"  ❌ {table} table NOT found")
            except Exception as e:
                print(f"  ❌ Error checking {table}: {str(e)}")
        
        print()
        print("If any tables are missing, run the SQL migration:")
        print("  1. Go to: https://supabase.com/dashboard/project/zletethctenqtufahukg/sql/new")
        print("  2. Copy/paste: backend/supabase_migration.sql")
        print("  3. Click 'Run'")
        
    except Exception as e:
        print(f"❌ Database connection failed: {str(e)}")
        print()
        print("Check:")
        print("  - SUPABASE_DB_URL is set in backend/.env")
        print("  - Password is correct")
        print("  - Supabase project is active")

if __name__ == "__main__":
    asyncio.run(check_tables())

