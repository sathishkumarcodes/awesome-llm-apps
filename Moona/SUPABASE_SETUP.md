# 🚀 Supabase Setup Guide for Moona

Supabase is a great choice! It provides PostgreSQL database, built-in authentication, and is much easier to set up than MongoDB.

## Step 1: Create Supabase Account (2 minutes)

1. Go to: https://supabase.com/
2. Click "Start your project" or "Sign up"
3. Sign up with GitHub, Google, or email
4. Create a new organization (if prompted)

## Step 2: Create a New Project

1. Click "New Project"
2. Fill in:
   - **Name**: `moona` (or your choice)
   - **Database Password**: Create a strong password (SAVE THIS!)
   - **Region**: Choose closest to you
   - **Pricing Plan**: Free tier is perfect for development
3. Click "Create new project" (takes 1-2 minutes)

## Step 3: Get Your Connection Details

Once your project is ready:

1. Go to **Settings** (gear icon) → **API**
2. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - **service_role key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (keep secret!)

3. Go to **Settings** → **Database**
4. Under "Connection string", copy the **URI** connection string:
   - It looks like: `postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres`

## Step 4: Update Environment Variables

### Backend (.env)

Update `backend/.env`:

```env
# Supabase Configuration
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=your_anon_public_key_here
SUPABASE_SERVICE_KEY=your_service_role_key_here
SUPABASE_DB_URL=postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres

# Remove or comment out MongoDB:
# MONGO_URL=mongodb://localhost:27017
# DB_NAME=moona_db
```

**Important**: Replace `[YOUR-PASSWORD]` in the DB URL with your actual database password!

## Step 5: Create Database Tables

Run the SQL migration script (I'll create this) to set up your tables in Supabase:

1. Go to **SQL Editor** in Supabase dashboard
2. Run the migration SQL (see `supabase_migration.sql`)

## Step 6: Install Dependencies

```bash
cd backend
pip install supabase asyncpg psycopg2-binary
```

## Step 7: Restart Backend

```bash
cd backend
python3 -m uvicorn server:app --reload --port 8000
```

## Benefits of Supabase

✅ **No MongoDB setup needed** - Just create account and project  
✅ **Built-in authentication** - Can use Supabase Auth (optional)  
✅ **PostgreSQL database** - More powerful than MongoDB for relational data  
✅ **Automatic REST API** - Supabase generates APIs automatically  
✅ **Real-time subscriptions** - Built-in real-time features  
✅ **Free tier** - Generous free tier for development  

## Next Steps

After setup, I'll help you:
1. Migrate database operations to Supabase
2. Optionally use Supabase Auth (or keep custom auth)
3. Update all backend endpoints

---

**Ready to set up? Visit: https://supabase.com/**

