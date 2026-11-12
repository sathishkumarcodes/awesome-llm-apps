"""
Binance API integration for importing cryptocurrency holdings
Uses Binance API v3 for account data
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

binance_router = APIRouter(prefix="/binance", tags=["binance"])

class BinanceConnection(BaseModel):
    connected: bool
    api_key_configured: bool
    last_sync: Optional[str] = None
    holdings_count: int = 0
    error: Optional[str] = None

class BinanceCredentials(BaseModel):
    api_key: str
    api_secret: str
    testnet: bool = False  # Use Binance testnet

class ImportResult(BaseModel):
    success: bool
    imported: int
    failed: int
    errors: List[str] = []

def generate_binance_signature(query_string: str, secret: str) -> str:
    """Generate HMAC SHA256 signature for Binance API"""
    return hmac.new(
        secret.encode('utf-8'),
        query_string.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

async def binance_api_request(
    method: str,
    endpoint: str,
    api_key: str,
    api_secret: str,
    params: dict = None,
    testnet: bool = False
) -> dict:
    """Make authenticated request to Binance API"""
    base_url = "https://testnet.binance.vision" if testnet else "https://api.binance.com"
    
    if params is None:
        params = {}
    
    # Add timestamp
    params['timestamp'] = int(time.time() * 1000)
    
    # Create query string
    query_string = '&'.join([f"{k}={v}" for k, v in sorted(params.items())])
    
    # Generate signature
    signature = generate_binance_signature(query_string, api_secret)
    query_string += f"&signature={signature}"
    
    headers = {
        "X-MBX-APIKEY": api_key
    }
    
    url = f"{base_url}{endpoint}?{query_string}"
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            if method == "GET":
                response = await client.get(url, headers=headers)
            elif method == "POST":
                response = await client.post(url, headers=headers)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")
            
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"Binance API error: {e.response.status_code} - {e.response.text}")
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Binance API error: {e.response.text}"
        )
    except Exception as e:
        logger.error(f"Error calling Binance API: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to connect to Binance: {str(e)}")

async def get_binance_account(api_key: str, api_secret: str, testnet: bool = False) -> dict:
    """Get Binance account information"""
    try:
        response = await binance_api_request(
            "GET",
            "/api/v3/account",
            api_key,
            api_secret,
            testnet=testnet
        )
        return response
    except Exception as e:
        logger.error(f"Error fetching Binance account: {str(e)}")
        raise

async def get_binance_holdings(api_key: str, api_secret: str, testnet: bool = False) -> List[dict]:
    """Get all cryptocurrency holdings from Binance"""
    try:
        account = await get_binance_account(api_key, api_secret, testnet)
        
        balances = account.get("balances", [])
        holdings = []
        
        for balance in balances:
            free = float(balance.get("free", 0))
            locked = float(balance.get("locked", 0))
            total = free + locked
            
            # Only include assets with non-zero balance
            if total > 0:
                asset = balance.get("asset", "")
                holdings.append({
                    "symbol": asset,
                    "name": asset,
                    "balance": total,
                    "free": free,
                    "locked": locked
                })
        
        return holdings
    except Exception as e:
        logger.error(f"Error fetching Binance holdings: {str(e)}")
        raise

@binance_router.post("/connect")
async def connect_binance(
    credentials: BinanceCredentials,
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Connect Binance account and import holdings"""
    try:
        if current_user.id == "mock_user_123" or len(current_user.id) < 32:
            raise HTTPException(status_code=401, detail="Please log in")
        
        # Test API connection
        try:
            account = await get_binance_account(
                credentials.api_key,
                credentials.api_secret,
                credentials.testnet
            )
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to connect to Binance: {str(e)}"
            )
        
        # Get holdings
        holdings_data = await get_binance_holdings(
            credentials.api_key,
            credentials.api_secret,
            credentials.testnet
        )
        
        if not holdings_data:
            return ImportResult(
                success=True,
                imported=0,
                failed=0,
                errors=["No holdings found in Binance account"]
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
                
                # For Binance, we need to map to trading pairs
                # Try to get price using common trading pairs
                price_data = None
                price = 0
                
                # Try USDT pair first (most common)
                try:
                    price_data = await price_service.get_price(f"{symbol}USDT", "crypto")
                    if "error" not in price_data:
                        price = float(price_data.get("price", price_data.get("current_price", 0)))
                except:
                    pass
                
                # If USDT pair fails, try USD
                if price == 0:
                    try:
                        price_data = await price_service.get_price(f"{symbol}USD", "crypto")
                        if "error" not in price_data:
                            price = float(price_data.get("price", price_data.get("current_price", 0)))
                    except:
                        pass
                
                # If still no price, try direct symbol
                if price == 0:
                    try:
                        price_data = await price_service.get_price(symbol, "crypto")
                        if "error" not in price_data:
                            price = float(price_data.get("price", price_data.get("current_price", 0)))
                    except:
                        pass
                
                if price == 0:
                    failed_count += 1
                    import_errors.append(f"Could not fetch price for {symbol}")
                    continue
                
                # Calculate values
                total_value = balance * price
                # For crypto, we use current price as avg_cost if we don't have historical data
                avg_cost = price  # Could be improved with transaction history
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
                    "Binance"
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
                        balance,
                        avg_cost,
                        price,
                        total_value,
                        total_cost,
                        gain_loss,
                        gain_loss_percent,
                        current_user.id,
                        symbol,
                        "Binance"
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
                        "crypto",  # Binance only imports crypto
                        balance,
                        avg_cost,
                        price,
                        total_value,
                        total_cost,
                        gain_loss,
                        gain_loss_percent,
                        "Binance"
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
            errors=import_errors[:10]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error importing from Binance: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to import from Binance: {str(e)}")

@binance_router.get("/status")
async def get_binance_status(
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Get Binance connection status"""
    try:
        if current_user.id == "mock_user_123" or len(current_user.id) < 32:
            return BinanceConnection(
                connected=False,
                api_key_configured=False,
                holdings_count=0
            )
        
        pool = await get_db_pool()
        
        # Count Binance holdings
        holdings = await execute_query(
            "SELECT COUNT(*) as count, MAX(last_updated) as last_sync FROM holdings WHERE user_id = $1 AND platform = $2",
            current_user.id,
            "Binance"
        )
        
        count = holdings[0]["count"] if holdings else 0
        last_sync = holdings[0]["last_sync"] if holdings and holdings[0]["last_sync"] else None
        
        # Check if API keys are configured
        api_key_configured = bool(
            os.environ.get("BINANCE_API_KEY") or 
            os.environ.get("BINANCE_API_SECRET")
        )
        
        return BinanceConnection(
            connected=count > 0,
            api_key_configured=api_key_configured,
            last_sync=last_sync.isoformat() if last_sync else None,
            holdings_count=count
        )
    except Exception as e:
        logger.error(f"Error getting Binance status: {str(e)}")
        return BinanceConnection(
            connected=False,
            api_key_configured=False,
            holdings_count=0,
            error=str(e)
        )

@binance_router.delete("/disconnect")
async def disconnect_binance(
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Remove all Binance holdings (disconnect account)"""
    try:
        if current_user.id == "mock_user_123" or len(current_user.id) < 32:
            raise HTTPException(status_code=401, detail="Please log in")
        
        pool = await get_db_pool()
        
        # Delete all Binance holdings
        await execute_one(
            "DELETE FROM holdings WHERE user_id = $1 AND platform = $2 RETURNING id",
            current_user.id,
            "Binance"
        )
        
        return {"success": True, "message": "Binance holdings removed"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disconnecting Binance: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to disconnect: {str(e)}")

@binance_router.post("/test-connection")
async def test_binance_connection(
    credentials: BinanceCredentials
):
    """Test Binance API connection without importing"""
    try:
        account = await get_binance_account(
            credentials.api_key,
            credentials.api_secret,
            credentials.testnet
        )
        
        return {
            "success": True,
            "message": f"Successfully connected to Binance. Account permissions verified.",
            "account_type": account.get("accountType", "unknown")
        }
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Connection failed: {str(e)}"
        )

