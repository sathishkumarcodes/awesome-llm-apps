# 🚀 Quick Fix: Gmail Login Not Working

## The Problem
Gmail login fails because `SUPABASE_DB_URL` is not configured in `backend/.env`.

## Quick Setup (5 minutes)

### Option 1: If you already have Supabase project

1. **Get your connection string:**
   - Go to: https://supabase.com/dashboard
   - Select your project
   - Go to: **Settings** → **Database**
   - Under "Connection string", copy the **URI** (not the other formats)
   - It looks like: `postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres`

2. **Add to backend/.env:**
   ```bash
   SUPABASE_DB_URL=postgresql://postgres:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres
   ```
   Replace `[PASSWORD]` with your actual database password.

3. **Run SQL migration:**
   - Go to Supabase Dashboard → **SQL Editor**
   - Copy/paste the contents of `backend/supabase_migration.sql`
   - Click **Run**

4. **Restart backend:**
   ```bash
   # Kill old backend
   pkill -f uvicorn
   
   # Start new backend
   cd backend
   python3 -m uvicorn server:app --reload --port 8000 --host 127.0.0.1
   ```

### Option 2: Create new Supabase project (if you don't have one)

1. **Create account:**
   - Go to: https://supabase.com/
   - Click "Start your project"
   - Sign up (free tier is fine)

2. **Create project:**
   - Click "New Project"
   - Name: `moona` (or your choice)
   - **Database Password**: Create a strong password (SAVE THIS!)
   - Region: Choose closest
   - Click "Create new project" (takes 1-2 minutes)

3. **Get connection string:**
   - Go to: **Settings** → **Database**
   - Copy the **URI** connection string
   - Format: `postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres`

4. **Add to backend/.env:**
   ```bash
   SUPABASE_DB_URL=postgresql://postgres:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres
   ```

5. **Run SQL migration:**
   - Go to Supabase Dashboard → **SQL Editor**
   - Copy/paste: `backend/supabase_migration.sql`
   - Click **Run**

6. **Restart backend:**
   ```bash
   pkill -f uvicorn
   cd backend
   python3 -m uvicorn server:app --reload --port 8000 --host 127.0.0.1
   ```

## Verify It Works

1. **Test the endpoint:**
   ```bash
   curl http://localhost:8000/api/auth/me
   ```
   Should return: `{"user": null}` (not an error)

2. **Try Gmail login:**
   - Go to: http://localhost:3000/login
   - Click "Continue with Gmail"
   - Should work now! ✅

## Still Not Working?

Check:
- ✅ `SUPABASE_DB_URL` is in `backend/.env` (no typos)
- ✅ Password in connection string matches your Supabase database password
- ✅ SQL migration ran successfully (check Supabase SQL Editor → History)
- ✅ Backend restarted after adding `SUPABASE_DB_URL`
- ✅ Backend logs show "Supabase database pool created" (not errors)

## Need Help?

See full guide: `SUPABASE_SETUP.md`

