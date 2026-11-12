"""
Phantom wallet integration for importing Solana cryptocurrency holdings
Connects to Phantom wallet via frontend and reads wallet balances
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
import logging
from datetime import datetime, timezone
from auth import get_current_user_dependency, UserData
from price_service import price_service
from db_supabase import get_db_pool, execute_insert, execute_query, execute_one

logger = logging.getLogger(__name__)

phantom_router = APIRouter(prefix="/phantom", tags=["phantom"])

class PhantomConnection(BaseModel):
    connected: bool
    wallet_address: Optional[str] = None
    last_sync: Optional[str] = None
    holdings_count: int = 0
    error: Optional[str] = None

class PhantomWalletData(BaseModel):
    address: str
    balances: List[dict]  # List of {symbol, balance, chain}

class ImportResult(BaseModel):
    success: bool
    imported: int
    failed: int
    errors: List[str] = []

async def get_solana_token_price(symbol: str) -> float:
    """Get token price from price service"""
    try:
        # Try to get price
        price_data = await price_service.get_price(symbol, "crypto")
        if "error" not in price_data:
            return float(price_data.get("price", price_data.get("current_price", 0)))
        return 0
    except Exception as e:
        logger.warning(f"Could not get price for {symbol}: {str(e)}")
        return 0

@phantom_router.post("/connect")
async def connect_phantom(
    wallet_data: PhantomWalletData,
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Import holdings from Phantom wallet"""
    try:
        if current_user.id == "mock_user_123" or len(current_user.id) < 32:
            raise HTTPException(status_code=401, detail="Please log in")
        
        if not wallet_data.address or not wallet_data.balances:
            raise HTTPException(
                status_code=400,
                detail="Wallet address and balances are required"
            )
        
        # Import holdings
        imported_count = 0
        failed_count = 0
        import_errors = []
        
        pool = await get_db_pool()
        
        for balance_data in wallet_data.balances:
            try:
                symbol = balance_data.get("symbol", "").upper()
                balance = float(balance_data.get("balance", 0))
                chain = balance_data.get("chain", "solana")
                
                if balance == 0:
                    continue
                
                # Get current price
                price = await get_solana_token_price(symbol)
                
                if price == 0:
                    # Skip if we can't get price, but log it
                    failed_count += 1
                    import_errors.append(f"Could not fetch price for {symbol}")
                    continue
                
                # Calculate values
                total_value = balance * price
                # For crypto, we use current price as avg_cost
                avg_cost = price
                total_cost = balance * avg_cost
                gain_loss = total_value - total_cost
                gain_loss_percent = (gain_loss / total_cost) * 100 if total_cost > 0 else 0
                
                # Determine asset name
                name = balance_data.get("name", symbol)
                
                # Check if holding already exists
                existing = await execute_query(
                    "SELECT id FROM holdings WHERE user_id = $1 AND symbol = $2 AND platform = $3",
                    current_user.id,
                    symbol,
                    "Phantom"
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
                        "Phantom"
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
                        "crypto",  # Phantom only imports crypto
                        balance,
                        avg_cost,
                        price,
                        total_value,
                        total_cost,
                        gain_loss,
                        gain_loss_percent,
                        "Phantom"
                    )
                
                imported_count += 1
                
            except Exception as e:
                failed_count += 1
                error_msg = f"Failed to import {balance_data.get('symbol', 'unknown')}: {str(e)}"
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
        logger.error(f"Error importing from Phantom: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to import from Phantom: {str(e)}")

@phantom_router.get("/status")
async def get_phantom_status(
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Get Phantom connection status"""
    try:
        if current_user.id == "mock_user_123" or len(current_user.id) < 32:
            return PhantomConnection(
                connected=False,
                holdings_count=0
            )
        
        pool = await get_db_pool()
        
        # Count Phantom holdings
        holdings = await execute_query(
            "SELECT COUNT(*) as count, MAX(last_updated) as last_sync FROM holdings WHERE user_id = $1 AND platform = $2",
            current_user.id,
            "Phantom"
        )
        
        count = holdings[0]["count"] if holdings else 0
        last_sync = holdings[0]["last_sync"] if holdings and holdings[0]["last_sync"] else None
        
        return PhantomConnection(
            connected=count > 0,
            last_sync=last_sync.isoformat() if last_sync else None,
            holdings_count=count
        )
    except Exception as e:
        logger.error(f"Error getting Phantom status: {str(e)}")
        return PhantomConnection(
            connected=False,
            holdings_count=0,
            error=str(e)
        )

@phantom_router.delete("/disconnect")
async def disconnect_phantom(
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Remove all Phantom holdings (disconnect wallet)"""
    try:
        if current_user.id == "mock_user_123" or len(current_user.id) < 32:
            raise HTTPException(status_code=401, detail="Please log in")
        
        pool = await get_db_pool()
        
        # Delete all Phantom holdings
        await execute_one(
            "DELETE FROM holdings WHERE user_id = $1 AND platform = $2 RETURNING id",
            current_user.id,
            "Phantom"
        )
        
        return {"success": True, "message": "Phantom holdings removed"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disconnecting Phantom: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to disconnect: {str(e)}")

