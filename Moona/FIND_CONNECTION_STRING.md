# 🔍 How to Find Your Supabase Connection String

## Step-by-Step Instructions

### Option 1: Direct Link (Easiest)
1. **Go directly to**: https://supabase.com/dashboard/project/zletethctenqtufahukg/settings/database
2. **Look for "Connection string" section** (usually near the top)
3. **Click the "URI" tab** (not JDBC, Golang, etc.)
4. **Copy the string** - it should look like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.zletethctenqtufahukg.supabase.co:5432/postgres
   ```
   ⚠️ Note: The `[YOUR-PASSWORD]` part might be hidden. You'll need to replace it with your actual password.

### Option 2: Through Settings Menu
1. Go to: https://supabase.com/dashboard/project/zletethctenqtufahukg
2. Click **"Settings"** (gear icon) in the left sidebar
3. Click **"Database"** in the settings menu
4. Scroll down to find **"Connection string"** section
5. Click the **"URI"** tab
6. Copy the connection string

### Option 3: If You See "Connect" Button
1. In Database settings, look for a **"Connect"** button
2. Click it
3. Select **"Direct connection"** (not connection pooling)
4. Copy the connection string shown

## If Password is Hidden

The connection string might show `[YOUR-PASSWORD]` as a placeholder. You need to:

1. **If you remember your password:**
   - Replace `[YOUR-PASSWORD]` in the connection string with your actual password
   - Example: If password is `mypass123`, the string becomes:
     ```
     postgresql://postgres:mypass123@db.zletethctenqtufahukg.supabase.co:5432/postgres
     ```

2. **If you don't remember your password:**
   - In Database settings, look for **"Connection info"** section
   - Click **"Reset database password"** or **"Show password"**
   - Set a new password (save it!)
   - Use that password in the connection string

## Quick Alternative

If you can't find it, I can construct the connection string for you if you provide:
- Your database password (the one you set when creating the project)

Just share your password and I'll create the full connection string!

