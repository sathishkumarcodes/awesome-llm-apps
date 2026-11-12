# 📡 Moona API Documentation

Complete API reference for the Moona Investment Portfolio Tracker backend.

**Base URL**: `http://localhost:8000/api` (development)  
**Production URL**: `https://your-domain.com/api`

## 🔐 Authentication

Most endpoints require authentication via session token. The token can be provided in two ways:

1. **Cookie** (preferred): `session_token` cookie set automatically after login
2. **Authorization Header**: `Authorization: Bearer <session_token>`

### Authentication Endpoints

#### POST `/api/auth/session`

Store user session data and set authentication cookie.

**Request Body:**
```json
{
  "id": "user_123",
  "email": "user@example.com",
  "name": "John Doe",
  "picture": "https://example.com/avatar.jpg",
  "session_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Session stored successfully"
}
```

**Status Codes:**
- `200`: Success
- `500`: Server error

---

#### GET `/api/auth/me`

Get current authenticated user information.

**Headers:**
- Cookie: `session_token=<token>` (optional)
- Authorization: `Bearer <token>` (optional)

**Response:**
```json
{
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "picture": "https://example.com/avatar.jpg"
  }
}
```

**Status Codes:**
- `200`: Success
- `401`: Unauthorized (invalid or expired session)

---

#### GET `/api/auth/oauth-session/{session_id}`

Get OAuth session data from external OAuth service.

**Path Parameters:**
- `session_id` (string): OAuth session identifier

**Headers:**
- `X-Session-ID`: OAuth session ID

**Response:**
```json
{
  "id": "user_123",
  "email": "user@example.com",
  "name": "John Doe",
  "picture": "https://example.com/avatar.jpg"
}
```

**Status Codes:**
- `200`: Success
- `401`: Invalid session ID
- `500`: Server error

---

#### POST `/api/auth/logout`

Logout user by deleting session.

**Headers:**
- Cookie: `session_token=<token>`

**Response:**
```json
{
  "status": "success",
  "message": "Logged out successfully"
}
```

**Status Codes:**
- `200`: Success
- `500`: Server error

---

## 💼 Holdings Management

All holdings endpoints require authentication.

### Data Models

#### Holding Object
```json
{
  "id": "507f1f77bcf86cd799439011",
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "type": "stock",
  "shares": 10.5,
  "avg_cost": 150.00,
  "current_price": 182.52,
  "total_value": 1916.46,
  "total_cost": 1575.00,
  "gain_loss": 341.46,
  "gain_loss_percent": 21.68,
  "sector": "Technology",
  "platform": "Robinhood",
  "last_updated": "2024-01-15T10:30:00Z",
  "created_at": "2024-01-01T08:00:00Z"
}
```

#### Holding Types
- `stock`: Stock investments
- `crypto`: Cryptocurrency investments
- `roth_ira`: Roth IRA account investments

---

### GET `/api/holdings`

Get all holdings for the authenticated user with updated prices.

**Headers:**
- Cookie: `session_token=<token>` (required)

**Response:**
```json
[
  {
    "id": "507f1f77bcf86cd799439011",
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "type": "stock",
    "shares": 10.5,
    "avg_cost": 150.00,
    "current_price": 182.52,
    "total_value": 1916.46,
    "total_cost": 1575.00,
    "gain_loss": 341.46,
    "gain_loss_percent": 21.68,
    "sector": "Technology",
    "platform": "Robinhood",
    "last_updated": "2024-01-15T10:30:00Z",
    "created_at": "2024-01-01T08:00:00Z"
  }
]
```

**Status Codes:**
- `200`: Success
- `401`: Unauthorized
- `500`: Server error

**Notes:**
- Prices are automatically updated from external APIs
- Holdings are filtered by authenticated user

---

### GET `/api/holdings/{holding_id}`

Get a specific holding by ID.

**Path Parameters:**
- `holding_id` (string): MongoDB ObjectId of the holding

**Headers:**
- Cookie: `session_token=<token>` (required)

**Response:**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "type": "stock",
  "shares": 10.5,
  "avg_cost": 150.00,
  "current_price": 182.52,
  "total_value": 1916.46,
  "total_cost": 1575.00,
  "gain_loss": 341.46,
  "gain_loss_percent": 21.68,
  "sector": "Technology",
  "platform": "Robinhood",
  "last_updated": "2024-01-15T10:30:00Z",
  "created_at": "2024-01-01T08:00:00Z"
}
```

**Status Codes:**
- `200`: Success
- `401`: Unauthorized
- `404`: Holding not found
- `500`: Server error

---

### POST `/api/holdings`

Create a new holding with real-time price fetching.

**Headers:**
- Cookie: `session_token=<token>` (required)
- Content-Type: `application/json`

**Request Body:**
```json
{
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "type": "stock",
  "shares": 10.5,
  "avg_cost": 150.00,
  "sector": "Technology",
  "platform": "Robinhood"
}
```

**Field Validation:**
- `symbol`: Required, 1-10 characters
- `name`: Required, 1-200 characters
- `type`: Required, must be `stock`, `crypto`, or `roth_ira`
- `shares`: Required, must be > 0
- `avg_cost`: Required, must be > 0
- `sector`: Optional, max 100 characters
- `platform`: Optional, max 100 characters

**Response:**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "type": "stock",
  "shares": 10.5,
  "avg_cost": 150.00,
  "current_price": 182.52,
  "total_value": 1916.46,
  "total_cost": 1575.00,
  "gain_loss": 341.46,
  "gain_loss_percent": 21.68,
  "sector": "Technology",
  "platform": "Robinhood",
  "last_updated": "2024-01-15T10:30:00Z",
  "created_at": "2024-01-15T10:30:00Z"
}
```

**Status Codes:**
- `200`: Success
- `400`: Invalid input or price fetch failed
- `401`: Unauthorized
- `500`: Server error

**Notes:**
- Current price is automatically fetched from external APIs
- Gain/loss calculations are performed automatically

---

### PUT `/api/holdings/{holding_id}`

Update an existing holding.

**Path Parameters:**
- `holding_id` (string): MongoDB ObjectId of the holding

**Headers:**
- Cookie: `session_token=<token>` (required)
- Content-Type: `application/json`

**Request Body:**
```json
{
  "name": "Apple Inc. (Updated)",
  "shares": 12.0,
  "avg_cost": 155.00,
  "sector": "Technology",
  "platform": "E*TRADE"
}
```

**Field Validation:**
- All fields are optional
- `name`: 1-200 characters if provided
- `shares`: Must be > 0 if provided
- `avg_cost`: Must be > 0 if provided
- `sector`: Max 100 characters if provided
- `platform`: Max 100 characters if provided

**Response:**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "symbol": "AAPL",
  "name": "Apple Inc. (Updated)",
  "type": "stock",
  "shares": 12.0,
  "avg_cost": 155.00,
  "current_price": 182.52,
  "total_value": 2190.24,
  "total_cost": 1860.00,
  "gain_loss": 330.24,
  "gain_loss_percent": 17.75,
  "sector": "Technology",
  "platform": "E*TRADE",
  "last_updated": "2024-01-15T11:00:00Z",
  "created_at": "2024-01-01T08:00:00Z"
}
```

**Status Codes:**
- `200`: Success
- `400`: Invalid input or no fields to update
- `401`: Unauthorized
- `404`: Holding not found
- `500`: Server error

**Notes:**
- Price is automatically updated
- Gain/loss is recalculated based on new values

---

### DELETE `/api/holdings/{holding_id}`

Delete a holding.

**Path Parameters:**
- `holding_id` (string): MongoDB ObjectId of the holding

**Headers:**
- Cookie: `session_token=<token>` (required)

**Response:**
```json
{
  "message": "Holding deleted successfully"
}
```

**Status Codes:**
- `200`: Success
- `401`: Unauthorized
- `404`: Holding not found
- `500`: Server error

---

### GET `/api/holdings/search/{symbol}`

Search for a symbol and get current price information.

**Path Parameters:**
- `symbol` (string): Stock or cryptocurrency symbol (e.g., "AAPL", "BTC")

**Headers:**
- Cookie: `session_token=<token>` (required)

**Response:**
```json
{
  "symbol": "AAPL",
  "current_price": 182.52,
  "currency": "USD",
  "source": "yahoo_finance",
  "last_updated": "2024-01-15T10:30:00Z"
}
```

**Status Codes:**
- `200`: Success
- `401`: Unauthorized
- `404`: Symbol not found
- `500`: Server error

**Notes:**
- Automatically detects if symbol is stock or crypto
- Uses cached prices when available (5-minute cache)

---

### GET `/api/holdings/platforms/{asset_type}`

Get available platforms for a specific asset type.

**Path Parameters:**
- `asset_type` (string): One of `stock`, `crypto`, or `roth_ira`

**Headers:**
- Cookie: `session_token=<token>` (required)

**Response:**
```json
{
  "platforms": [
    "Robinhood",
    "E*TRADE",
    "TD Ameritrade",
    "Charles Schwab",
    "Fidelity",
    "Interactive Brokers",
    "Webull",
    "M1 Finance",
    "Vanguard",
    "Merrill Lynch",
    "Ally Invest",
    "SoFi Invest",
    "Public",
    "Cash App Investing",
    "Other"
  ]
}
```

**Status Codes:**
- `200`: Success
- `401`: Unauthorized
- `500`: Server error

---

### GET `/api/holdings/portfolio/summary`

Get portfolio summary with aggregated statistics.

**Headers:**
- Cookie: `session_token=<token>` (required)

**Response:**
```json
{
  "total_value": 185680.50,
  "total_cost": 150000.00,
  "total_gain_loss": 35680.50,
  "total_gain_loss_percent": 23.79,
  "asset_count": 12,
  "asset_breakdown": {
    "stocks": 5,
    "crypto": 3,
    "roth_ira": 4
  },
  "last_updated": "2024-01-15T10:30:00Z"
}
```

**Status Codes:**
- `200`: Success
- `401`: Unauthorized
- `500`: Server error

**Notes:**
- Prices are automatically updated before calculation
- Returns zeros if user has no holdings

---

## 📊 Export

### GET `/api/export/holdings/excel`

Export all holdings to a formatted Excel file.

**Headers:**
- Cookie: `session_token=<token>` (required)
- Accept: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

**Response:**
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Content-Disposition: `attachment; filename=portfolio_holdings_YYYYMMDD_HHMMSS.xlsx`

**Status Codes:**
- `200`: Success
- `401`: Unauthorized
- `404`: No holdings found
- `500`: Server error

**Excel File Structure:**
- **Holdings Sheet**: All holdings with detailed information
- **Portfolio Summary Sheet**: Aggregated statistics and asset breakdown

**Notes:**
- File includes formatted cells, colors for gain/loss, and auto-adjusted column widths
- Filename includes timestamp for easy organization

---

## 🔄 Status & Health

### GET `/api/`

Health check endpoint.

**Response:**
```json
{
  "message": "Hello World"
}
```

**Status Codes:**
- `200`: Success

---

### GET `/api/status`

Get all status checks (for monitoring).

**Response:**
```json
[
  {
    "id": "uuid-here",
    "client_name": "test-client",
    "timestamp": "2024-01-15T10:30:00Z"
  }
]
```

**Status Codes:**
- `200`: Success

---

### POST `/api/status`

Create a status check.

**Request Body:**
```json
{
  "client_name": "test-client"
}
```

**Response:**
```json
{
  "id": "uuid-here",
  "client_name": "test-client",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Status Codes:**
- `200`: Success

---

## ⚠️ Error Responses

All endpoints may return error responses in the following format:

```json
{
  "detail": "Error message describing what went wrong"
}
```

### Common Status Codes

- `200`: Success
- `400`: Bad Request (validation error, invalid input)
- `401`: Unauthorized (missing or invalid session token)
- `404`: Not Found (resource doesn't exist)
- `500`: Internal Server Error

### Error Examples

**401 Unauthorized:**
```json
{
  "detail": "No session token found"
}
```

**400 Bad Request:**
```json
{
  "detail": "Could not fetch price: Symbol not found"
}
```

**404 Not Found:**
```json
{
  "detail": "Holding not found"
}
```

---

## 🔌 Price Service

The backend automatically fetches prices from multiple sources:

1. **Stocks**: Yahoo Finance (primary), Alpha Vantage (optional, requires API key)
2. **Cryptocurrencies**: CoinGecko API
3. **Caching**: 5-minute cache to reduce API calls

### Price Fetching Behavior

- Prices are automatically updated when:
  - Creating a new holding
  - Fetching holdings list
  - Getting a specific holding
  - Getting portfolio summary

- Cache is used when:
  - Price was fetched within last 5 minutes
  - External API is unavailable (fallback to cached data)

- Fallback behavior:
  - If all APIs fail, mock prices are returned for demonstration
  - This ensures the UI remains functional during API outages

---

## 📝 Rate Limiting

The price service implements intelligent rate limiting:

- **Batch Processing**: Multiple symbols are processed in batches of 3
- **Rate Limiting**: 500ms delay between batches
- **Timeout**: 15 seconds per batch
- **Caching**: Reduces redundant API calls

---

## 🔒 Security

### Session Management

- Sessions expire after 7 days
- HttpOnly cookies prevent XSS attacks
- Secure flag ensures HTTPS-only transmission
- SameSite=None allows cross-site requests (production)

### Data Isolation

- All holdings are scoped to the authenticated user
- Users can only access their own data
- Session validation on every request

---

## 📚 Interactive Documentation

When the backend is running, visit:

- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

These provide interactive API documentation where you can:
- View all endpoints
- See request/response schemas
- Test endpoints directly
- View authentication requirements

---

## 🧪 Testing

Example API calls using `curl`:

### Get Holdings
```bash
curl -X GET "http://localhost:8000/api/holdings" \
  -H "Cookie: session_token=your_token_here"
```

### Create Holding
```bash
curl -X POST "http://localhost:8000/api/holdings" \
  -H "Content-Type: application/json" \
  -H "Cookie: session_token=your_token_here" \
  -d '{
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "type": "stock",
    "shares": 10.5,
    "avg_cost": 150.00,
    "sector": "Technology",
    "platform": "Robinhood"
  }'
```

### Get Portfolio Summary
```bash
curl -X GET "http://localhost:8000/api/holdings/portfolio/summary" \
  -H "Cookie: session_token=your_token_here"
```

---

## 🆘 Support

For issues or questions:
1. Check the [README.md](./README.md) for setup instructions
2. Review error messages in API responses
3. Check backend logs for detailed error information
4. Ensure environment variables are correctly configured

---

**Last Updated**: January 2024  
**API Version**: 1.0

