# 🌙 Moona - Investment Portfolio Tracker

A modern, full-stack investment portfolio tracking application with real-time price updates, comprehensive analytics, and beautiful UI. Track stocks, cryptocurrencies, ETFs, bonds, and Roth IRA investments all in one place.

![Moona Dashboard](https://img.shields.io/badge/Status-Production%20Ready-success)
![Python](https://img.shields.io/badge/Python-3.8+-blue)
![React](https://img.shields.io/badge/React-19.0-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110-green)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green)

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Running the Application](#-running-the-application)
- [Project Structure](#-project-structure)
- [API Documentation](#-api-documentation)
- [Authentication](#-authentication)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [License](#-license)

## ✨ Features

### Core Functionality
- **Multi-Asset Tracking**: Stocks, Cryptocurrencies, ETFs, Bonds, and Roth IRA accounts
- **Real-Time Price Updates**: Automatic price fetching from multiple sources (Yahoo Finance, CoinGecko, Alpha Vantage) with intelligent fallbacks
- **Portfolio Analytics**: Comprehensive performance metrics, gain/loss calculations, and return percentages
- **Visual Analytics**: Interactive charts for performance, allocation, SPY comparison, and asset class breakdown
- **Excel Export**: Export your entire portfolio to a formatted Excel file
- **Search & Filter**: Find holdings by symbol, type, platform, or sector
- **Delta Import**: Smart CSV imports that add new holdings, update existing ones, and remove deleted holdings

### Exchange & Wallet Integration
- **Robinhood**: Import holdings via CSV export
- **Coinbase**: Direct API integration with API key/secret
- **Binance**: Direct API integration with API key/secret (supports testnet)
- **Fidelity**: Import holdings via CSV export
- **MetaMask**: Direct wallet connection for Ethereum and EVM chains
- **Phantom**: Direct wallet connection for Solana blockchain
- **Unified Import Modal**: Single interface to import from all platforms

### Dashboard Features
- **5 Comprehensive Tabs**:
  - **Overview**: Portfolio summary, asset breakdown pie chart, top performers, best performer, monthly contributions
  - **Analytics**: Portfolio percentage pie chart, asset class performance bar chart
  - **Allocation**: Asset type allocation, sector allocation, allocation summary
  - **Holdings**: Full list with search, filter, sort, and edit capabilities
  - **vs SPY**: Portfolio performance comparison against S&P 500 index

### User Experience
- **Modern UI**: Glassmorphism design with gradient elements and smooth animations
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- **Dual Authentication**: Google OAuth login and local email/password registration
- **Protected Routes**: Secure access to dashboard and portfolio data
- **Toast Notifications**: User-friendly feedback for all actions
- **Interactive Charts**: Hover effects, tooltips, and smooth animations
- **Beautiful Pie Charts**: Portfolio percentage visualization with color-coded labels

### Technical Features
- **Price Caching**: Intelligent caching to reduce API calls and improve performance
- **Rate Limiting**: Smart batch processing for external API calls with retries
- **Error Handling**: Graceful fallbacks and comprehensive error messages
- **Async Operations**: Fully asynchronous backend for optimal performance
- **Progressive Data Loading**: Critical data loads first, analytics in background
- **Type Safety**: Full TypeScript-like validation with Pydantic

## 🛠 Tech Stack

### Backend
- **FastAPI**: Modern, fast web framework for building APIs
- **Supabase (PostgreSQL)**: Relational database with asyncpg driver
- **Python 3.8+**: Core programming language
- **Pydantic**: Data validation and settings management
- **PyCoinGecko**: Cryptocurrency price data
- **OpenPyXL**: Excel file generation
- **Passlib**: Password hashing with bcrypt
- **PyJWT**: JWT token verification for Google OAuth

### Frontend
- **React 19**: Modern UI library
- **React Router**: Client-side routing with protected routes
- **Tailwind CSS**: Utility-first CSS framework
- **shadcn/ui**: High-quality component library
- **Axios**: HTTP client for API calls
- **Lucide React**: Beautiful icon library
- **Custom Charts**: SVG-based performance, pie, and bar charts

### External Services
- **Yahoo Finance API**: Stock price data (free, no API key required)
- **CoinGecko API**: Cryptocurrency price data (free tier)
- **Alpha Vantage**: Stock price data (optional, requires API key)
- **Google OAuth**: Authentication via Google Sign-In
- **Supabase**: Database and authentication services

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Python 3.8+** ([Download](https://www.python.org/downloads/))
- **Node.js 18+** and **npm/yarn** ([Download](https://nodejs.org/))
- **Supabase account** ([Sign up](https://supabase.com))
- **Git** for version control

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/sathishkumarcodes/Moona.git
cd Moona
```

### 2. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment (recommended)
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Frontend Setup

```bash
# Navigate to frontend directory (from project root)
cd frontend

# Install dependencies
npm install --legacy-peer-deps
# or
yarn install
```

## ⚙️ Configuration

### Backend Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_DB_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

# CORS Configuration (comma-separated for multiple origins)
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Optional: Alpha Vantage API Key (for enhanced stock data)
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key_here

# Google OAuth (for Google Sign-In)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Frontend URL (for OAuth redirects)
FRONTEND_URL=http://localhost:3000
```

### Frontend Environment Variables

Create a `.env` file in the `frontend/` directory:

```env
REACT_APP_BACKEND_URL=http://localhost:8000
REACT_APP_GOOGLE_CLIENT_ID=your_google_client_id
```

### Database Setup

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Get your connection string from Project Settings → Database
3. Run the migration SQL script in Supabase SQL Editor:
   ```bash
   # Copy and paste the contents of backend/supabase_migration.sql
   # into the Supabase SQL Editor and execute
   ```

## 🏃 Running the Application

### Start Backend Server

```bash
# From backend directory
cd backend

# Activate virtual environment (if not already active)
source venv/bin/activate  # macOS/Linux
# or
venv\Scripts\activate  # Windows

# Run the server
uvicorn server:app --reload --port 8000
```

The backend will be available at `http://localhost:8000`

API documentation (Swagger UI) will be available at `http://localhost:8000/docs`

### Start Frontend Development Server

```bash
# From frontend directory
cd frontend

# Start development server
npm start
# or
yarn start
```

The frontend will be available at `http://localhost:3000`

## 📁 Project Structure

```
Moona/
├── backend/
│   ├── auth.py              # Authentication routes (Google OAuth + local)
│   ├── auth_supabase.py     # Supabase-specific auth utilities
│   ├── holdings.py          # Holdings CRUD operations
│   ├── portfolio.py         # Portfolio analytics and calculations
│   ├── price_service.py     # Price fetching service with caching
│   ├── excel_export.py      # Excel export functionality
│   ├── db_supabase.py      # Supabase database connection
│   ├── robinhood_import.py # Robinhood CSV import
│   ├── coinbase_import.py  # Coinbase API integration
│   ├── binance_import.py   # Binance API integration
│   ├── fidelity_import.py   # Fidelity CSV import
│   ├── metamask_import.py  # MetaMask wallet integration
│   ├── phantom_import.py   # Phantom wallet integration
│   ├── server.py           # FastAPI application entry point
│   ├── supabase_migration.sql # Database schema
│   ├── requirements.txt    # Python dependencies
│   └── .env                # Environment variables (not in repo)
│
├── frontend/
│   ├── public/
│   │   └── index.html       # HTML template
│   ├── src/
│   │   ├── components/      # React components
│   │   │   ├── Dashboard.jsx
│   │   │   ├── LoginPage.jsx
│   │   │   ├── InvestmentList.jsx
│   │   │   ├── PortfolioPieChart.jsx
│   │   │   ├── AssetClassBarChart.jsx
│   │   │   ├── PerformanceChart.jsx
│   │   │   ├── PieChart.jsx
│   │   │   ├── ContributionChart.jsx
│   │   │   ├── ImportHoldingsModal.jsx
│   │   │   ├── AddHoldingModal.jsx
│   │   │   ├── EditHoldingModal.jsx
│   │   │   └── ui/          # shadcn/ui components
│   │   ├── services/
│   │   │   ├── holdingsService.js
│   │   │   └── portfolioService.js
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── App.js           # Main app component
│   │   └── index.js         # Entry point
│   ├── package.json
│   └── tailwind.config.js
│
├── README.md               # This file
└── API.md                  # API documentation
```

## 📚 API Documentation

For detailed API documentation, see [API.md](./API.md)

Quick overview:
- **Authentication**: `/api/auth/*` - Google OAuth, local registration/login, session management
- **Holdings**: `/api/holdings/*` - CRUD operations for investments
- **Portfolio**: `/api/portfolio/*` - Analytics, performance, allocation, SPY comparison
- **Export**: `/api/export/*` - Excel export functionality
- **Imports**: 
  - `/api/robinhood/*` - Robinhood CSV import
  - `/api/coinbase/*` - Coinbase API integration
  - `/api/binance/*` - Binance API integration
  - `/api/fidelity/*` - Fidelity CSV import
  - `/api/metamask/*` - MetaMask wallet connection
  - `/api/phantom/*` - Phantom wallet connection

Interactive API documentation is available at `http://localhost:8000/docs` when the backend is running.

## 🔐 Authentication

Moona supports dual authentication methods:

### Google OAuth
1. User clicks "Sign in with Google" on the login page
2. Redirects to Google OAuth consent screen
3. User authorizes the application
4. Google redirects back with authorization code
5. Backend exchanges code for user info
6. Session is created and stored in database
7. User is redirected to dashboard

### Local Email/Password
1. User registers with email and password
2. Password is hashed with bcrypt
3. User account is created in database
4. User can log in with email/password
5. Session is created and managed

### Session Management
- Sessions are stored in PostgreSQL with 7-day expiry
- HttpOnly cookies prevent XSS attacks
- Secure flag ensures HTTPS-only transmission (production)
- SameSite=None allows cross-site requests (production)

### Protected Routes
All holdings, portfolio, and export endpoints require authentication. The backend validates the session token from cookies or Authorization header.

## 🎨 Dashboard Features

### Overview Tab
- Portfolio summary row with cost basis, current value, gain/loss
- KPI cards: Total Holdings, Total Return %, Best Performer, Asset Types
- Asset Breakdown pie chart
- Top Performers list
- Best Performer card
- Monthly Average Contribution

### Analytics Tab
- Portfolio Percentage pie chart with individual holdings
- Asset Class Performance bar chart showing total return by asset class
- Interactive filters for asset types
- Hover effects and tooltips

### Allocation Tab
- Asset Type Allocation pie chart
- Sector Allocation pie chart
- Allocation Summary with risk profile and diversification metrics

### Holdings Tab
- Full list of all holdings
- Search by symbol/name
- Filter by asset type and platform
- Sort by value, gain, or name
- Edit and delete capabilities
- Real-time price updates

### vs SPY Tab
- Portfolio vs SPY comparison cards
- Performance chart comparison
- Key metrics table
- Investment insights

## 🚢 Deployment

### Backend Deployment

#### Option 1: Railway / Render / Heroku

1. Create a new project
2. Connect your GitHub repository
3. Set environment variables in the platform dashboard
4. Deploy from `backend/` directory
5. Set start command: `uvicorn server:app --host 0.0.0.0 --port $PORT`

#### Option 2: Docker

```dockerfile
# Dockerfile (in backend/)
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
```

```bash
docker build -t moona-backend ./backend
docker run -p 8000:8000 --env-file ./backend/.env moona-backend
```

### Frontend Deployment

#### Option 1: Vercel / Netlify

1. Connect your GitHub repository
2. Set build directory to `frontend`
3. Set build command: `cd frontend && npm install && npm run build`
4. Set publish directory to `frontend/build`
5. Add environment variables:
   - `REACT_APP_BACKEND_URL=your_backend_url`
   - `REACT_APP_GOOGLE_CLIENT_ID=your_google_client_id`

#### Option 2: Static Hosting

```bash
cd frontend
npm run build
# Upload the build/ directory to your hosting provider
```

### Environment Variables for Production

**Backend:**
```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_DB_URL=your_database_connection_string
CORS_ORIGINS=https://your-frontend-domain.com
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
FRONTEND_URL=https://your-frontend-domain.com
ALPHA_VANTAGE_API_KEY=your_key (optional)
```

**Frontend:**
```env
REACT_APP_BACKEND_URL=https://your-backend-domain.com
REACT_APP_GOOGLE_CLIENT_ID=your_google_client_id
```

## 🧪 Testing

### Backend Testing

Test files are available in the root directory:
- `backend_test.py` - Holdings API testing
- `test_db_connection.py` - Database connection testing

Run tests:
```bash
python backend_test.py
```

### Frontend Testing

```bash
cd frontend
npm test
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow PEP 8 for Python code
- Use ESLint/Prettier for JavaScript/React code
- Write meaningful commit messages
- Add tests for new features
- Update documentation as needed

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

If you encounter any issues or have questions:

1. Check the [API Documentation](./API.md)
2. Review existing [Issues](https://github.com/sathishkumarcodes/Moona/issues)
3. Create a new issue with detailed information

## 🎯 Recent Updates

### v2.0 - Major Feature Release
- ✅ Migrated from MongoDB to Supabase (PostgreSQL)
- ✅ Added Google OAuth authentication
- ✅ Implemented local email/password registration
- ✅ Added exchange integrations (Coinbase, Binance, Robinhood, Fidelity)
- ✅ Added wallet integrations (MetaMask, Phantom)
- ✅ Enhanced portfolio pie chart with filters and unique colors
- ✅ Added asset class performance bar chart
- ✅ Improved dashboard with 5 comprehensive tabs
- ✅ Delta import functionality for CSV files
- ✅ Enhanced price fetching with retries and fallbacks
- ✅ Progressive data loading for better performance

## 🎯 Roadmap

- [ ] Gold & Silver tracking
- [ ] Historical price charts
- [ ] Dividend tracking
- [ ] Tax reporting features
- [ ] Mobile app (React Native)
- [ ] Real-time notifications
- [ ] Portfolio sharing
- [ ] Advanced analytics and insights
- [ ] More exchange integrations (Kraken, Gemini, etc.)
- [ ] Automated portfolio rebalancing suggestions

## 🙏 Acknowledgments

- [shadcn/ui](https://ui.shadcn.com/) for beautiful UI components
- [CoinGecko](https://www.coingecko.com/) for cryptocurrency data
- [Yahoo Finance](https://finance.yahoo.com/) for stock market data
- [FastAPI](https://fastapi.tiangolo.com/) for the excellent framework
- [Supabase](https://supabase.com/) for database and backend services

---

**Made with ❤️ by the Moona Team**
