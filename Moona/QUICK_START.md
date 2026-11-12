# 🚀 Quick Start Guide

## MongoDB Atlas Setup (5 minutes)

### Step 1: Sign Up (1 minute)
1. Visit: https://www.mongodb.com/cloud/atlas/register
2. Sign up with Google/GitHub/Email
3. Verify your email if needed

### Step 2: Create Cluster (2 minutes)
1. Click **"Build a Database"**
2. Choose **FREE** (M0 Sandbox) - $0/month
3. Select **AWS** as provider
4. Choose region closest to you
5. Click **"Create"** (wait 3-5 minutes)

### Step 3: Create Database User (1 minute)
1. Click **"Database Access"** (left menu)
2. Click **"Add New Database User"**
3. Authentication: **"Password"**
4. Username: `moona_user` (or your choice)
5. Password: Create a strong password (SAVE THIS!)
6. Privileges: **"Atlas Admin"**
7. Click **"Add User"**

### Step 4: Whitelist IP (30 seconds)
1. Click **"Network Access"** (left menu)
2. Click **"Add IP Address"**
3. Click **"Allow Access from Anywhere"** (for development)
4. Click **"Confirm"**

### Step 5: Get Connection String (30 seconds)
1. Click **"Database"** (left menu)
2. Click **"Connect"** button on your cluster
3. Choose **"Connect your application"**
4. Driver: **"Python"**, Version: **"3.6 or later"**
5. **Copy the connection string** (looks like):
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

### Step 6: Update Your .env File

Replace the connection string in `backend/.env`:

```bash
# Open the file
nano backend/.env
# or
open backend/.env
```

Replace this line:
```env
MONGO_URL=mongodb://localhost:27017
```

With your Atlas connection string (replace `<username>` and `<password>`):
```env
MONGO_URL=mongodb+srv://moona_user:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

**Important:** Replace:
- `<username>` with your database username
- `<password>` with your database password
- Keep the rest of the string as-is

### Step 7: Restart Backend Server

Stop the current server (Ctrl+C) and restart:

```bash
cd /Users/sathishkumar/Downloads/Moona-main/backend
python3 -m uvicorn server:app --reload --port 8000
```

You should see connection success in the logs!

---

## Or Use the Setup Script

Run the interactive setup script:

```bash
cd /Users/sathishkumar/Downloads/Moona-main
./setup_mongodb.sh
```

---

## Verify Connection

Once the backend is running, test it:

```bash
curl http://localhost:8000/api/
```

You should see: `{"message":"Hello World"}`

Visit API docs: http://localhost:8000/docs

---

## Need Help?

See detailed guide: [SETUP_MONGODB.md](./SETUP_MONGODB.md)

