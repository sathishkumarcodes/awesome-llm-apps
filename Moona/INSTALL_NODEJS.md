# ⚡ Quick Node.js Installation for Moona Frontend

## 🎯 Fastest Way to See Your Frontend

### Option 1: Direct Download (2 minutes)

1. **Download Node.js**:
   - I'm downloading it for you, or visit: https://nodejs.org/
   - Click the **green "LTS" button** (recommended version)

2. **Install**:
   - Open the downloaded `.pkg` file
   - Follow the installation wizard (just click "Continue" and "Install")
   - Enter your password when prompted

3. **Restart Terminal**:
   - Close and reopen your terminal
   - Or run: `source ~/.zshrc` or `source ~/.bash_profile`

4. **Verify**:
   ```bash
   node --version
   npm --version
   ```

5. **Start Frontend**:
   ```bash
   cd /Users/sathishkumar/Downloads/Moona-main/frontend
   npm install
   npm start
   ```

### Option 2: Using Homebrew (if you have it)

```bash
brew install node
```

### Option 3: Using nvm (Node Version Manager)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.zshrc
nvm install --lts
nvm use --lts
```

## 🚀 After Installation

Once Node.js is installed, run these commands:

```bash
# Navigate to frontend
cd /Users/sathishkumar/Downloads/Moona-main/frontend

# Install dependencies (first time only)
npm install

# Start the development server
npm start
```

The browser will automatically open to **http://localhost:3000** showing your Moona app! 🎉

## 📱 What You'll See

Your frontend includes:

1. **Landing Page** (`/`) - Beautiful gradient design with animated moon
2. **Login Page** (`/login`) - Google OAuth integration
3. **Dashboard** (`/dashboard`) - Full portfolio tracking interface with:
   - Portfolio overview with KPIs
   - Performance charts
   - Asset allocation pie charts
   - Holdings list with filtering
   - SPY comparison
   - Excel export functionality

## 🎨 Frontend Features

- **Modern Glassmorphism Design** - Beautiful translucent cards
- **Animated Moon Background** - Celestial theme
- **Responsive Layout** - Works on all screen sizes
- **Real-time Data** - Connects to your backend API
- **Interactive Charts** - Performance and allocation visualizations

---

**Install Node.js now to see your beautiful frontend!** ✨

