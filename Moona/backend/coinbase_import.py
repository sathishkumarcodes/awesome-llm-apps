"""
Coinbase API integration for importing cryptocurrency holdings
Uses Coinbase Advanced Trade API (v2) for account data
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
import logging
import hmac
import hashlib
import time
import httpx
import os
from datetime import datetime, timezone
from auth import get_current_user_dependency, UserData
from price_service import price_service
from db_supabase import get_db_pool, execute_insert, execute_query, execute_one

logger = logging.getLogger(__name__)

coinbase_router = APIRouter(prefix="/coinbase", tags=["coinbase"])

class CoinbaseConnection(BaseModel):
    connected: bool
    api_key_configured: bool
    last_sync: Optional[str] = None
    holdings_count: int = 0
    error: Optional[str] = None

class CoinbaseCredentials(BaseModel):
    api_key: str
    api_secret: str
    sandbox: bool = False  # Use Coinbase Advanced Trade sandbox

class ImportResult(BaseModel):
    success: bool
    imported: int
    failed: int
    errors: List[str] = []

def generate_signature(timestamp: str, method: str, path: str, body: str, secret: str) -> str:
    """Generate HMAC signature for Coinbase API authentication"""
    message = timestamp + method + path + body
    signature = hmac.new(
        secret.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    return signature

async def coinbase_api_request(
    method: str,
    path: str,
    api_key: str,
    api_secret: str,
    body: str = "",
    sandbox: bool = False
) -> dict:
    """Make authenticated request to Coinbase Advanced Trade API"""
    base_url = "https://api.coinbase.com" if not sandbox else "https://api.coinbase.com"
    # Note: Coinbase Advanced Trade API uses different endpoints
    # For now, we'll use the standard Coinbase API which is more accessible
    
    timestamp = str(int(time.time()))
    signature = generate_signature(timestamp, method, path, body, api_secret)
    
    headers = {
        "CB-ACCESS-KEY": api_key,
        "CB-ACCESS-SIGN": signature,
        "CB-ACCESS-TIMESTAMP": timestamp,
        "Content-Type": "application/json"
    }
    
    url = f"{base_url}{path}"
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            if method == "GET":
                response = await client.get(url, headers=headers)
            elif method == "POST":
                response = await client.post(url, headers=headers, content=body)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")
            
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"Coinbase API error: {e.response.status_code} - {e.response.text}")
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Coinbase API error: {e.response.text}"
        )
    except Exception as e:
        logger.error(f"Error calling Coinbase API: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to connect to Coinbase: {str(e)}")

async def get_coinbase_accounts(api_key: str, api_secret: str, sandbox: bool = False) -> List[dict]:
    """Get all Coinbase accounts (wallets)"""
    try:
        # Use Coinbase API v2 to get accounts
        # Note: This requires proper API key permissions
        response = await coinbase_api_request(
            "GET",
            "/v2/accounts",
            api_key,
            api_secret,
            sandbox=sandbox
        )
        
        accounts = response.get("data", [])
        return accounts
    except Exception as e:
        logger.error(f"Error fetching Coinbase accounts: {str(e)}")
        raise

async def get_coinbase_holdings(api_key: str, api_secret: str, sandbox: bool = False) -> List[dict]:
    """Get all cryptocurrency holdings from Coinbase"""
    try:
        accounts = await get_coinbase_accounts(api_key, api_secret, sandbox)
        
        holdings = []
        for account in accounts:
            balance = float(account.get("balance", {}).get("amount", 0))
            currency = account.get("balance", {}).get("currency", "")
            account_type = account.get("type", "")
            
            # Only include accounts with non-zero balance
            if balance > 0 and currency:
                holdings.append({
                    "symbol": currency.upper(),
                    "name": account.get("name", currency),
                    "balance": balance,
                    "account_type": account_type,
                    "native_balance": account.get("native_balance", {})
                })
        
        return holdings
    except Exception as e:
        logger.error(f"Error fetching Coinbase holdings: {str(e)}")
        raise

@coinbase_router.post("/connect")
async def connect_coinbase(
    credentials: CoinbaseCredentials,
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Connect Coinbase account and import holdings"""
    try:
        if current_user.id == "mock_user_123" or len(current_user.id) < 32:
            raise HTTPException(status_code=401, detail="Please log in")
        
        # Test API connection
        try:
            accounts = await get_coinbase_accounts(
                credentials.api_key,
                credentials.api_secret,
                credentials.sandbox
            )
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to connect to Coinbase: {str(e)}"
            )
        
        # Get holdings
        holdings_data = await get_coinbase_holdings(
            credentials.api_key,
            credentials.api_secret,
            credentials.sandbox
        )
        
        if not holdings_data:
            return ImportResult(
                success=True,
                imported=0,
                failed=0,
                errors=["No holdings found in Coinbase account"]
            )
        
        # Import holdings
        imported_count = 0
        failed_count = 0
        import_errors = []
        
        pool = await get_db_pool()
        
        for holding_data in holdings_data:
            try:
                symbol = holding_data["symbol"]
                balance = holding_data["balance"]
                
                # Get current price (crypto)
                price_data = await price_service.get_price(symbol, "crypto")
                
                if "error" in price_data:
                    # Skip if we can't get price
                    failed_count += 1
                    import_errors.append(f"Could not fetch price for {symbol}")
                    continue
                
                current_price = float(price_data.get("price", price_data.get("current_price", 0)))
                
                if current_price == 0:
                    failed_count += 1
                    import_errors.append(f"Price is zero for {symbol}")
                    continue
                
                # Calculate values
                total_value = balance * current_price
                # For crypto, we use current price as avg_cost if we don't have historical data
                avg_cost = current_price  # Could be improved with transaction history
                total_cost = balance * avg_cost
                gain_loss = total_value - total_cost
                gain_loss_percent = (gain_loss / total_cost) * 100 if total_cost > 0 else 0
                
                # Determine asset name
                name = holding_data.get("name", symbol)
                
                # Check if holding already exists
                existing = await execute_query(
                    "SELECT id FROM holdings WHERE user_id = $1 AND symbol = $2 AND platform = $3",
                    current_user.id,
                    symbol,
                    "Coinbase"
                )
                
                if existing:
                    # Update existing holding
                    await execute_one(
                        """UPDATE holdings SET 
                           name = $1, shares = $2, avg_cost = $3, current_price = $4,
                           total_value = $5, total_cost = $6, gain_loss = $7,
                           gain_loss_percent = $8, last_updated = NOW()
                           WHERE user_id = $9 AND symbol = $10 AND platform = $11
                           RETURNING *""",
                        name,
                        balance,  # shares = balance for crypto
                        avg_cost,
                        current_price,
                        total_value,
                        total_cost,
                        gain_loss,
                        gain_loss_percent,
                        current_user.id,
                        symbol,
                        "Coinbase"
                    )
                else:
                    # Insert new holding
                    await execute_insert(
                        """INSERT INTO holdings 
                           (user_id, symbol, name, type, shares, avg_cost, current_price, total_value, 
                            total_cost, gain_loss, gain_loss_percent, platform)
                           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                           RETURNING *""",
                        current_user.id,
                        symbol,
                        name,
                        "crypto",  # Coinbase only imports crypto
                        balance,
                        avg_cost,
                        current_price,
                        total_value,
                        total_cost,
                        gain_loss,
                        gain_loss_percent,
                        "Coinbase"
                    )
                
                imported_count += 1
                
            except Exception as e:
                failed_count += 1
                error_msg = f"Failed to import {holding_data.get('symbol', 'unknown')}: {str(e)}"
                import_errors.append(error_msg)
                logger.error(error_msg)
        
        return ImportResult(
            success=imported_count > 0,
            imported=imported_count,
            failed=failed_count,
            errors=import_errors[:10]  # Limit to first 10 errors
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error importing from Coinbase: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to import from Coinbase: {str(e)}")

@coinbase_router.get("/status")
async def get_coinbase_status(
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Get Coinbase connection status"""
    try:
        if current_user.id == "mock_user_123" or len(current_user.id) < 32:
            return CoinbaseConnection(
                connected=False,
                api_key_configured=False,
                holdings_count=0
            )
        
        pool = await get_db_pool()
        
        # Count Coinbase holdings
        holdings = await execute_query(
            "SELECT COUNT(*) as count, MAX(last_updated) as last_sync FROM holdings WHERE user_id = $1 AND platform = $2",
            current_user.id,
            "Coinbase"
        )
        
        count = holdings[0]["count"] if holdings else 0
        last_sync = holdings[0]["last_sync"] if holdings and holdings[0]["last_sync"] else None
        
        # Check if API keys are configured (from environment or user settings)
        api_key_configured = bool(
            os.environ.get("COINBASE_API_KEY") or 
            os.environ.get("COINBASE_API_SECRET")
        )
        
        return CoinbaseConnection(
            connected=count > 0,
            api_key_configured=api_key_configured,
            last_sync=last_sync.isoformat() if last_sync else None,
            holdings_count=count
        )
    except Exception as e:
        logger.error(f"Error getting Coinbase status: {str(e)}")
        return CoinbaseConnection(
            connected=False,
            api_key_configured=False,
            holdings_count=0,
            error=str(e)
        )

@coinbase_router.delete("/disconnect")
async def disconnect_coinbase(
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Remove all Coinbase holdings (disconnect account)"""
    try:
        if current_user.id == "mock_user_123" or len(current_user.id) < 32:
            raise HTTPException(status_code=401, detail="Please log in")
        
        pool = await get_db_pool()
        
        # Delete all Coinbase holdings
        await execute_one(
            "DELETE FROM holdings WHERE user_id = $1 AND platform = $2 RETURNING id",
            current_user.id,
            "Coinbase"
        )
        
        return {"success": True, "message": "Coinbase holdings removed"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disconnecting Coinbase: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to disconnect: {str(e)}")

@coinbase_router.post("/test-connection")
async def test_coinbase_connection(
    credentials: CoinbaseCredentials
):
    """Test Coinbase API connection without importing"""
    try:
        accounts = await get_coinbase_accounts(
            credentials.api_key,
            credentials.api_secret,
            credentials.sandbox
        )
        
        return {
            "success": True,
            "message": f"Successfully connected to Coinbase. Found {len(accounts)} accounts.",
            "accounts_count": len(accounts)
        }
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Connection failed: {str(e)}"
        )

