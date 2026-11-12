# MongoDB Setup Guide for Moona

## Quick Setup: MongoDB Atlas (Recommended - Free)

MongoDB Atlas is a free cloud database service. Follow these steps:

### Step 1: Create MongoDB Atlas Account

1. Go to: https://www.mongodb.com/cloud/atlas/register
2. Click "Try Free" or "Sign Up"
3. Sign up with Google, GitHub, or email

### Step 2: Create a Free Cluster

1. After signing up, you'll be asked to create a cluster
2. Choose **FREE** tier (M0 Sandbox)
3. Select a cloud provider (AWS recommended)
4. Choose a region closest to you
5. Click "Create Cluster" (takes 3-5 minutes)

### Step 3: Create Database User

1. Go to **Database Access** (left sidebar)
2. Click **"Add New Database User"**
3. Choose **"Password"** authentication
4. Enter a username (e.g., `moona_user`)
5. Enter a strong password (save this!)
6. Under "Database User Privileges", select **"Atlas Admin"**
7. Click **"Add User"**

### Step 4: Whitelist Your IP Address

1. Go to **Network Access** (left sidebar)
2. Click **"Add IP Address"**
3. Click **"Allow Access from Anywhere"** (for development)
   - Or add your current IP: `0.0.0.0/0`
4. Click **"Confirm"**

### Step 5: Get Your Connection String

1. Go to **Database** (left sidebar)
2. Click **"Connect"** on your cluster
3. Choose **"Connect your application"**
4. Select **"Python"** and version **"3.6 or later"**
5. Copy the connection string (looks like):
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

### Step 6: Update Your .env File

1. Replace `<username>` with your database username
2. Replace `<password>` with your database password
3. Update `backend/.env`:

```env
MONGO_URL=mongodb+srv://moona_user:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
DB_NAME=moona_db
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

### Step 7: Test the Connection

The backend server will automatically connect when you restart it. Check the logs for connection success!

---

## Alternative: Local MongoDB Installation

If you prefer to run MongoDB locally:

### macOS (with Homebrew)

```bash
# Install Homebrew first (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install MongoDB
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

Then update `backend/.env`:
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=moona_db
```

### Windows

1. Download MongoDB from: https://www.mongodb.com/try/download/community
2. Run the installer
3. MongoDB will start automatically as a service
4. Use: `mongodb://localhost:27017`

### Linux

```bash
# Ubuntu/Debian
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
```

---

## Troubleshooting

### Connection Refused
- Check if MongoDB is running: `pgrep mongod`
- Verify your connection string in `.env`
- Check firewall settings

### Authentication Failed
- Verify username and password in connection string
- Make sure you've created a database user in Atlas
- Check IP whitelist in Network Access

### Timeout Errors
- Check your internet connection
- Verify the cluster is running in Atlas dashboard
- Try a different region if issues persist

---

## Need Help?

- MongoDB Atlas Docs: https://docs.atlas.mongodb.com/
- MongoDB Community: https://www.mongodb.com/community/forums/

