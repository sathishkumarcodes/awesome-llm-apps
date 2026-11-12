#!/bin/bash

# MongoDB Setup Helper Script for Moona
# This script helps you configure MongoDB for the Moona application

echo "🌙 Moona MongoDB Setup Helper"
echo "================================"
echo ""

# Check if .env file exists
if [ ! -f "backend/.env" ]; then
    echo "❌ backend/.env file not found. Creating one..."
    cat > backend/.env << 'EOF'
# MongoDB Configuration
MONGO_URL=mongodb://localhost:27017
DB_NAME=moona_db

# CORS Configuration
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Optional: Alpha Vantage API Key
# ALPHA_VANTAGE_API_KEY=your_key_here
EOF
    echo "✅ Created backend/.env file"
fi

echo ""
echo "Choose your MongoDB setup option:"
echo "1) MongoDB Atlas (Cloud - Recommended, Free)"
echo "2) Local MongoDB (Requires installation)"
echo "3) I already have a connection string"
echo ""
read -p "Enter your choice (1-3): " choice

case $choice in
    1)
        echo ""
        echo "📝 MongoDB Atlas Setup Instructions:"
        echo "===================================="
        echo ""
        echo "1. Go to: https://www.mongodb.com/cloud/atlas/register"
        echo "2. Sign up for a free account"
        echo "3. Create a free M0 cluster (takes 3-5 minutes)"
        echo "4. Create a database user:"
        echo "   - Go to Database Access → Add New Database User"
        echo "   - Choose 'Password' authentication"
        echo "   - Save your username and password!"
        echo "5. Whitelist your IP:"
        echo "   - Go to Network Access → Add IP Address"
        echo "   - Click 'Allow Access from Anywhere' (for development)"
        echo "6. Get your connection string:"
        echo "   - Go to Database → Connect → Connect your application"
        echo "   - Choose Python 3.6+"
        echo "   - Copy the connection string"
        echo ""
        echo "Once you have your connection string, run this script again and choose option 3"
        echo ""
        read -p "Press Enter to open MongoDB Atlas in your browser..."
        open "https://www.mongodb.com/cloud/atlas/register" 2>/dev/null || \
        xdg-open "https://www.mongodb.com/cloud/atlas/register" 2>/dev/null || \
        echo "Please visit: https://www.mongodb.com/cloud/atlas/register"
        ;;
    2)
        echo ""
        echo "📦 Local MongoDB Installation:"
        echo "=============================="
        echo ""
        
        # Check if Homebrew is installed (macOS)
        if [[ "$OSTYPE" == "darwin"* ]]; then
            if command -v brew &> /dev/null; then
                echo "Installing MongoDB via Homebrew..."
                brew tap mongodb/brew
                brew install mongodb-community
                brew services start mongodb-community
                echo "✅ MongoDB installed and started!"
                echo ""
                echo "Your .env file is already configured for local MongoDB:"
                echo "MONGO_URL=mongodb://localhost:27017"
            else
                echo "❌ Homebrew not found. Please install Homebrew first:"
                echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
                echo ""
                echo "Or use MongoDB Atlas (option 1) which doesn't require installation."
            fi
        else
            echo "For Linux/Windows, please install MongoDB manually:"
            echo "Linux: https://docs.mongodb.com/manual/installation/"
            echo "Windows: https://www.mongodb.com/try/download/community"
        fi
        ;;
    3)
        echo ""
        echo "📋 Enter Your MongoDB Connection String:"
        echo "========================================"
        echo ""
        echo "Example format:"
        echo "mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority"
        echo ""
        read -p "Paste your connection string here: " connection_string
        
        if [ -z "$connection_string" ]; then
            echo "❌ Connection string cannot be empty!"
            exit 1
        fi
        
        # Update .env file
        sed -i.bak "s|MONGO_URL=.*|MONGO_URL=$connection_string|" backend/.env
        echo ""
        echo "✅ Connection string updated in backend/.env"
        echo ""
        echo "Your configuration:"
        grep "MONGO_URL" backend/.env
        echo ""
        echo "🔄 Please restart your backend server for changes to take effect!"
        ;;
    *)
        echo "❌ Invalid choice. Please run the script again."
        exit 1
        ;;
esac

echo ""
echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Make sure your backend/.env file has the correct MONGO_URL"
echo "2. Restart your backend server:"
echo "   cd backend && python3 -m uvicorn server:app --reload --port 8000"
echo "3. Check the server logs to verify MongoDB connection"
echo ""

