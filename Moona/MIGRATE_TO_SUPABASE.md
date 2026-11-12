# 🔄 Migrate to Supabase - Step by Step Guide

## Overview

This guide will help you migrate from MongoDB to Supabase PostgreSQL.

## Step 1: Set Up Supabase (5 minutes)

1. **Create Supabase Account**:
   - Visit: https://supabase.com/
   - Sign up (free tier is perfect)
   - Create a new project

2. **Get Your Credentials**:
   - Go to Settings → API
   - Copy: Project URL, anon key, service_role key
   - Go to Settings → Database
   - Copy: Connection string (URI)

3. **Run Database Migration**:
   - Go to SQL Editor in Supabase dashboard
   - Copy contents of `backend/supabase_migration.sql`
   - Paste and click "Run"
   - ✅ Tables created!

## Step 2: Update Environment Variables

Update `backend/.env`:

```env
# Supabase Configuration
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=your_anon_public_key_here
SUPABASE_SERVICE_KEY=your_service_role_key_here
SUPABASE_DB_URL=postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres

# Comment out or remove MongoDB:
# MONGO_URL=mongodb://localhost:27017
# DB_NAME=moona_db

# Keep these:
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
FRONTEND_URL=http://localhost:3000
```

**Important**: Replace `[YOUR-PASSWORD]` in SUPABASE_DB_URL with your actual database password!

## Step 3: Install Dependencies

```bash
cd backend
pip install supabase asyncpg psycopg2-binary
```

## Step 4: Switch to Supabase Backend

You have two options:

### Option A: Use Supabase Files (Recommended)

Rename the Supabase files to replace the MongoDB ones:

```bash
cd backend
# Backup original files
mv auth.py auth_mongodb.py.bak
mv holdings.py holdings_mongodb.py.bak
mv excel_export.py excel_export_mongodb.py.bak
mv server.py server_mongodb.py.bak

# Use Supabase versions
mv auth_supabase.py auth.py
mv holdings_supabase.py holdings.py
mv excel_export_supabase.py excel_export.py
mv server_supabase.py server.py
```

### Option B: Update Existing Files

I can help you update the existing files directly if you prefer.

## Step 5: Test the Connection

```bash
cd backend
python3 -c "from db_supabase import get_db_pool; import asyncio; asyncio.run(get_db_pool()); print('✅ Supabase connection successful!')"
```

## Step 6: Restart Backend

```bash
cd backend
python3 -m uvicorn server:app --reload --port 8000
```

## Step 7: Test Login/Signup

1. Go to http://localhost:3000/login
2. Try registering a new account
3. Should work! ✅

## Troubleshooting

### Connection Error
- Check SUPABASE_DB_URL is correct
- Make sure password is replaced (not [YOUR-PASSWORD])
- Verify project is active in Supabase dashboard

### Import Errors
- Make sure all dependencies are installed: `pip install asyncpg psycopg2-binary`
- Check that db_supabase.py is in the backend directory

### Table Errors
- Make sure you ran the SQL migration in Supabase SQL Editor
- Check tables exist: Go to Table Editor in Supabase dashboard

## Benefits of Supabase

✅ **Easier Setup** - No MongoDB installation needed  
✅ **PostgreSQL** - More powerful relational database  
✅ **Built-in Auth** - Can use Supabase Auth (optional)  
✅ **Automatic APIs** - Supabase generates REST APIs  
✅ **Real-time** - Built-in real-time subscriptions  
✅ **Free Tier** - Generous free tier  

---

**Ready to migrate? Follow the steps above!**

