# ⚡ Quick MongoDB Fix for Login/Signup

## ❌ Current Issue

Your login and signup are failing because MongoDB is not connected.

## ✅ Quick Fix (Choose One)

### Option 1: MongoDB Atlas (Fastest - 2 minutes) ⭐ RECOMMENDED

1. **Sign up**: https://www.mongodb.com/cloud/atlas/register
2. **Create Free Cluster**:
   - Click "Build a Database"
   - Choose **FREE** (M0 Sandbox)
   - Click "Create"
3. **Create Database User**:
   - Go to "Database Access" → "Add New Database User"
   - Username: `moona_user`
   - Password: (create a strong password - SAVE THIS!)
   - Privileges: "Atlas Admin"
4. **Whitelist IP**:
   - Go to "Network Access" → "Add IP Address"
   - Click "Allow Access from Anywhere" (for development)
5. **Get Connection String**:
   - Go to "Database" → Click "Connect" on your cluster
   - Choose "Connect your application"
   - Copy the connection string (looks like):
     ```
     mongodb+srv://moona_user:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
     ```
6. **Update backend/.env**:
   ```bash
   cd backend
   nano .env
   # Replace MONGO_URL line with:
   MONGO_URL=mongodb+srv://moona_user:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
7. **Restart backend**:
   ```bash
   # Stop current backend (Ctrl+C)
   cd backend
   python3 -m uvicorn server:app --reload --port 8000
   ```

### Option 2: Local MongoDB (If you prefer local)

**macOS**:
```bash
# Install Homebrew first if needed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install MongoDB
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Then update backend/.env**:
```env
MONGO_URL=mongodb://localhost:27017
```

## ✅ Verify It Works

After setting up MongoDB, test:

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

You should get a user object back (not an error).

## 🎯 Then Test in Browser

1. Go to http://localhost:3000/login
2. Click "Sign Up" tab
3. Enter email and password
4. Click "Create Account"
5. Should redirect to dashboard!

---

**MongoDB Atlas is the fastest option - takes 2 minutes and works immediately!**

