# 🚀 Starting Your Moona App Locally

## Current Status

✅ **Backend Server**: Running on http://localhost:8000
- API Endpoint: http://localhost:8000/api/
- API Documentation: http://localhost:8000/docs

## Starting the Frontend

The frontend requires **Node.js** to be installed. Here are your options:

### Option 1: Install Node.js via Official Installer (Easiest)

1. **Download Node.js**:
   - Visit: https://nodejs.org/
   - Download the **LTS version** (recommended)
   - Run the installer and follow the prompts

2. **Verify Installation**:
   ```bash
   node --version
   npm --version
   ```

3. **Start Frontend**:
   ```bash
   cd /Users/sathishkumar/Downloads/Moona-main/frontend
   npm install
   npm start
   ```

### Option 2: Install via Homebrew (if you have it)

```bash
brew install node
cd /Users/sathishkumar/Downloads/Moona-main/frontend
npm install
npm start
```

### Option 3: Use nvm (Node Version Manager)

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Restart terminal or run:
source ~/.bashrc

# Install Node.js
nvm install --lts
nvm use --lts

# Start frontend
cd /Users/sathishkumar/Downloads/Moona-main/frontend
npm install
npm start
```

## Quick Start Commands

Once Node.js is installed:

```bash
# Terminal 1: Backend (already running)
# Backend is running at http://localhost:8000

# Terminal 2: Frontend
cd /Users/sathishkumar/Downloads/Moona-main/frontend
npm install    # First time only
npm start      # Starts on http://localhost:3000
```

## Access Your App

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000/api
- **API Docs**: http://localhost:8000/docs

## Troubleshooting

### Backend Issues

If backend isn't responding:
```bash
cd /Users/sathishkumar/Downloads/Moona-main/backend
python3 -m uvicorn server:app --reload --port 8000
```

### Frontend Issues

If `npm start` fails:
1. Make sure Node.js is installed: `node --version`
2. Delete `node_modules` and reinstall:
   ```bash
   cd frontend
   rm -rf node_modules package-lock.json
   npm install
   npm start
   ```

### MongoDB Connection

The backend is currently configured for local MongoDB. If you see connection errors:
1. Use MongoDB Atlas (see QUICK_START.md)
2. Or install MongoDB locally
3. Update `backend/.env` with your connection string

---

**Your backend is ready! Just install Node.js to start the frontend.** 🎉

