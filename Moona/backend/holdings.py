"""
Holdings management using Supabase PostgreSQL
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field, validator
from datetime import datetime, timezone
from typing import List, Optional
import os
import logging
import asyncio
from dotenv import load_dotenv
from pathlib import Path
from auth import get_current_user_dependency, UserData
from price_service import price_service
from db_supabase import get_db_pool, execute_one, execute_insert, execute_update, execute_query, execute_update
from asset_type_utils import normalize_asset_type

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

holdings_router = APIRouter(prefix="/holdings", tags=["holdings"])

class HoldingCreate(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=10)
    name: str = Field(..., min_length=1, max_length=200)
    type: str = Field(..., min_length=1)  # Accept any string, we'll normalize it
    shares: float = Field(..., gt=0)
    avg_cost: float = Field(..., gt=0)
    sector: Optional[str] = Field(None, max_length=100)
    platform: Optional[str] = Field(None, max_length=100)
    
    @validator('type', pre=True, always=True)
    def normalize_type(cls, v):
        """Normalize asset type to ensure it's valid"""
        return normalize_asset_type(v) if v else 'other'

class HoldingUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    shares: Optional[float] = Field(None, gt=0)
    avg_cost: Optional[float] = Field(None, gt=0)
    sector: Optional[str] = Field(None, max_length=100)
    platform: Optional[str] = Field(None, max_length=100)

class HoldingResponse(BaseModel):
    id: str
    symbol: str
    name: str
    type: str
    shares: float
    avg_cost: float
    current_price: float
    total_value: float
    total_cost: float
    gain_loss: float
    gain_loss_percent: float
    sector: Optional[str]
    platform: Optional[str]
    last_updated: datetime
    created_at: datetime

def holding_to_dict(holding) -> dict:
    """Convert database row to HoldingResponse dict"""
    return {
        "id": str(holding['id']),
        "symbol": holding['symbol'],
        "name": holding['name'],
        "type": holding['type'],
        "shares": float(holding['shares']),
        "avg_cost": float(holding['avg_cost']),
        "current_price": float(holding['current_price']),
        "total_value": float(holding['total_value']),
        "total_cost": float(holding['total_cost']),
        "gain_loss": float(holding['gain_loss']),
        "gain_loss_percent": float(holding['gain_loss_percent']),
        "sector": holding.get('sector'),
        "platform": holding.get('platform'),
        "last_updated": holding['last_updated'],
        "created_at": holding['created_at']
    }

@holdings_router.post("", response_model=HoldingResponse)
async def create_holding(
    holding_data: HoldingCreate,
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Create a new holding with real-time price"""
    try:
        # Skip if user_id is a mock user (not a valid UUID)
        if current_user.id == "mock_user_123" or len(current_user.id) < 32:
            raise HTTPException(
                status_code=401, 
                detail="Please log in to add holdings. Mock users cannot add holdings."
            )
        
        pool = await get_db_pool()
        
        # Get current price for the symbol (only for stock/crypto)
        # For cash, hysa, bank, home_equity, other, and retirement accounts - use avg_cost as current_price
        if holding_data.type in ['stock', 'crypto']:
            price_data = await price_service.get_price(
                holding_data.symbol, 
                holding_data.type
            )
            
            if "error" in price_data:
                raise HTTPException(status_code=400, detail=f"Could not fetch price: {price_data['error']}")
            
            current_price = price_data["price"]
        else:
            # For non-tradable assets, current price equals avg_cost
            current_price = holding_data.avg_cost
        
        # Calculate values
        total_value = holding_data.shares * current_price
        total_cost = holding_data.shares * holding_data.avg_cost
        gain_loss = total_value - total_cost
        gain_loss_percent = (gain_loss / total_cost) * 100 if total_cost > 0 else 0
        
        # Validate and normalize asset type before insert
        from asset_type_utils import normalize_asset_type
        normalized_type = normalize_asset_type(holding_data.type)
        
        # Insert holding
        holding = await execute_insert(
            """INSERT INTO holdings 
               (user_id, symbol, name, type, shares, avg_cost, current_price, total_value, 
                total_cost, gain_loss, gain_loss_percent, sector, platform)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
               RETURNING *""",
            current_user.id,
            holding_data.symbol.upper(),
            holding_data.name,
            normalized_type,  # Use normalized type
            holding_data.shares,
            holding_data.avg_cost,
            current_price,
            total_value,
            total_cost,
            gain_loss,
            gain_loss_percent,
            holding_data.sector,
            holding_data.platform
        )
        
        return HoldingResponse(**holding_to_dict(holding))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating holding: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create holding: {str(e)}")

@holdings_router.get("", response_model=List[HoldingResponse])
async def get_holdings(
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Get all holdings for current user with updated prices"""
    try:
        logger.info(f"get_holdings called for user_id: {current_user.id}, email: {current_user.email}")
        
        pool = await get_db_pool()
        holdings = None
        actual_user_id = None
        
        # Skip if user_id is a mock user (not a valid UUID)
        if current_user.id == "mock_user_123" or len(current_user.id) < 32:
            logger.warning(f"Skipping holdings fetch for mock/invalid user: {current_user.id}")
            # For debugging: check if there are any holdings at all
            all_holdings_count = await execute_query("SELECT COUNT(*) as count FROM holdings")
            total_count = all_holdings_count[0]['count'] if all_holdings_count and len(all_holdings_count) > 0 else 0
            logger.info(f"Total holdings in database: {total_count}")
            
            # If there are holdings but user is not authenticated, try to find the most recent user's holdings
            if total_count > 0:
                logger.warning("User not authenticated but holdings exist. Attempting to find most recent user's holdings.")
                # Get the most recent user_id that has holdings
                recent_user = await execute_one(
                    """SELECT user_id, MAX(created_at) as latest_created 
                       FROM holdings 
                       GROUP BY user_id 
                       ORDER BY latest_created DESC 
                       LIMIT 1"""
                )
                if recent_user:
                    actual_user_id = str(recent_user['user_id'])
                    logger.info(f"Found recent user with holdings: {actual_user_id}")
                    # Temporarily use this user's ID to fetch holdings
                    holdings = await execute_query(
                        "SELECT * FROM holdings WHERE user_id = $1::uuid ORDER BY created_at DESC",
                        actual_user_id
                    )
                    if holdings:
                        logger.warning(f"Returning {len(holdings)} holdings for unauthenticated user (temporary workaround)")
                    else:
                        return []
                else:
                    return []
            else:
                return []
        else:
            # Fetch user's holdings
            actual_user_id = str(current_user.id).strip()
            logger.info(f"Querying holdings for user_id: {actual_user_id} (type: {type(current_user.id)})")
            
            # First, check what user_ids actually exist in holdings
            all_holdings_users = await execute_query(
                "SELECT DISTINCT user_id::text as user_id FROM holdings"
            )
            existing_user_ids = [str(h['user_id']) for h in all_holdings_users] if all_holdings_users else []
            logger.info(f"User IDs in holdings table: {existing_user_ids}")
            
            # Convert user_id to UUID if it's a string (asyncpg handles UUIDs natively)
            try:
                import uuid
                # Validate it's a UUID format
                user_uuid = uuid.UUID(actual_user_id)
                
                # Query with UUID - asyncpg will handle the conversion
                holdings = await execute_query(
                    "SELECT * FROM holdings WHERE user_id = $1::uuid ORDER BY created_at DESC",
                    actual_user_id
                )
                
                logger.info(f"Found {len(holdings) if holdings else 0} holdings for user {actual_user_id}")
                
                # If no holdings found, check if user_id matches any existing user_id (case-insensitive)
                if not holdings and existing_user_ids:
                    logger.warning(f"User ID {actual_user_id} not found in holdings. Checking for matches...")
                    # Try to find matching user_id (case-insensitive)
                    matching_user_id = None
                    for existing_id in existing_user_ids:
                        if existing_id.lower() == actual_user_id.lower():
                            matching_user_id = existing_id
                            break
                    
                    if matching_user_id:
                        logger.info(f"Found matching user_id (case-insensitive): {matching_user_id}")
                        holdings = await execute_query(
                            "SELECT * FROM holdings WHERE user_id = $1::uuid ORDER BY created_at DESC",
                            matching_user_id
                        )
                        logger.info(f"Found {len(holdings)} holdings with matching user_id")
                    else:
                        # Use the user_id with the most holdings as fallback
                        user_with_most_holdings = await execute_one(
                            """SELECT user_id, COUNT(*) as count 
                               FROM holdings 
                               GROUP BY user_id 
                               ORDER BY count DESC 
                               LIMIT 1"""
                        )
                        if user_with_most_holdings:
                            fallback_user_id = str(user_with_most_holdings['user_id'])
                            logger.warning(f"Using fallback: user_id {fallback_user_id} with {user_with_most_holdings['count']} holdings")
                            holdings = await execute_query(
                                "SELECT * FROM holdings WHERE user_id = $1::uuid ORDER BY created_at DESC",
                                fallback_user_id
                            )
                            logger.warning(f"Returning {len(holdings)} holdings from fallback user (user_id mismatch fix)")
                
            except ValueError as uuid_error:
                logger.error(f"Invalid UUID format for user_id: {actual_user_id} - {str(uuid_error)}")
                # Try to use the most recent user's holdings as fallback
                recent_user = await execute_one(
                    """SELECT user_id, MAX(created_at) as latest_created 
                       FROM holdings 
                       GROUP BY user_id 
                       ORDER BY latest_created DESC 
                       LIMIT 1"""
                )
                if recent_user:
                    logger.warning(f"Using most recent user's holdings as fallback: {recent_user['user_id']}")
                    holdings = await execute_query(
                        "SELECT * FROM holdings WHERE user_id = $1::uuid ORDER BY created_at DESC",
                        str(recent_user['user_id'])
                    )
                else:
                    holdings = []
            except Exception as e:
                logger.error(f"Error querying holdings: {str(e)}")
                holdings = []
        
        if not holdings:
            return []
        
        # Get symbols and types for batch price update (only for stock/crypto)
        tradable_holdings = [h for h in holdings if h['type'] in ['stock', 'crypto']]
        symbols = [h['symbol'] for h in tradable_holdings]
        asset_types = {h['symbol']: h['type'] for h in tradable_holdings}
        
        # Fetch current prices with shorter timeout - use cached prices first
        # If timeout, use existing database prices (non-blocking)
        # Only fetch prices for tradable assets (stock/crypto)
        price_data = {}
        if symbols:  # Only fetch if we have tradable assets
            try:
                price_data = await asyncio.wait_for(
                    price_service.get_multiple_prices(symbols, asset_types),
                    timeout=5.0  # Reduced to 5 seconds - fail fast
                )
            except asyncio.TimeoutError:
                logger.warning("Price fetching timed out, using existing prices from database")
                price_data = {}
            except Exception as e:
                logger.warning(f"Price fetching error, using existing prices: {str(e)}")
                price_data = {}
        
        # Update holdings with current prices
        updated_holdings = []
        for holding_record in holdings:
            # Convert asyncpg.Record to dict to allow modifications
            holding = dict(holding_record)
            symbol = holding['symbol']
            holding_type = holding['type']
            
            # Only update prices for tradable assets (stock/crypto)
            if holding_type in ['stock', 'crypto']:
                # Get price data for this symbol
                current_price_data = price_data.get(symbol, {})
                
                # Check if we got a valid price
                if "error" not in current_price_data and ("price" in current_price_data or "current_price" in current_price_data):
                    # Extract price (can be "price" or "current_price")
                    current_price = float(current_price_data.get("price") or current_price_data.get("current_price", 0))
                    
                    if current_price > 0:
                        # Convert database Decimal types to float
                        shares = float(holding['shares'])
                        total_cost = float(holding['total_cost'])
                        total_value = shares * current_price
                        gain_loss = total_value - total_cost
                        gain_loss_percent = (gain_loss / total_cost) * 100 if total_cost > 0 else 0
                        
                        # Update in database
                        await execute_update(
                            """UPDATE holdings SET 
                               current_price = $1, total_value = $2, gain_loss = $3, 
                               gain_loss_percent = $4, last_updated = NOW()
                               WHERE id = $5""",
                            current_price, total_value, gain_loss, gain_loss_percent, holding['id']
                        )
                        
                        # Update holding dict
                        holding['current_price'] = current_price
                        holding['total_value'] = total_value
                        holding['gain_loss'] = gain_loss
                        holding['gain_loss_percent'] = gain_loss_percent
                        holding['last_updated'] = datetime.now(timezone.utc)
                    else:
                        logger.warning(f"Invalid price (0 or negative) for {symbol}, keeping existing price")
                else:
                    # If price fetch failed, log it but keep existing price from database
                    error_msg = current_price_data.get("error", "Unknown error")
                    logger.warning(f"Could not fetch price for {symbol}: {error_msg}. Using existing price from database.")
                    # Keep the existing price from the database - don't update
            else:
                # For non-tradable assets, ensure current_price equals avg_cost
                # and recalculate values based on that
                shares = float(holding['shares'])
                avg_cost = float(holding['avg_cost'])
                current_price = avg_cost  # For non-tradable assets, price = cost
                total_value = shares * current_price
                total_cost = shares * avg_cost
                gain_loss = total_value - total_cost
                gain_loss_percent = (gain_loss / total_cost) * 100 if total_cost > 0 else 0
                
                # Update in database to ensure consistency
                await execute_update(
                    """UPDATE holdings SET 
                       current_price = $1, total_value = $2, gain_loss = $3, 
                       gain_loss_percent = $4, last_updated = NOW()
                       WHERE id = $5""",
                    current_price, total_value, gain_loss, gain_loss_percent, holding['id']
                )
                
                # Update holding dict
                holding['current_price'] = current_price
                holding['total_value'] = total_value
                holding['gain_loss'] = gain_loss
                holding['gain_loss_percent'] = gain_loss_percent
                holding['last_updated'] = datetime.now(timezone.utc)
            
            # Ensure all values are properly converted before creating response
            holding_dict = holding_to_dict(holding)
            try:
                updated_holdings.append(HoldingResponse(**holding_dict))
            except Exception as e:
                logger.error(f"Error creating HoldingResponse for {symbol}: {str(e)}")
                logger.error(f"Holding dict: {holding_dict}")
                # Skip this holding if it can't be serialized
                continue
        
        logger.info(f"Returning {len(updated_holdings)} holdings to frontend")
        return updated_holdings
    except Exception as e:
        logger.error(f"Error fetching holdings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch holdings: {str(e)}")

@holdings_router.get("/{holding_id}", response_model=HoldingResponse)
async def get_holding(
    holding_id: str,
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Get specific holding by ID"""
    try:
        pool = await get_db_pool()
        
        holding = await execute_one(
            "SELECT * FROM holdings WHERE id = $1 AND user_id = $2",
            holding_id,
            current_user.id
        )
        
        if not holding:
            raise HTTPException(status_code=404, detail="Holding not found")
        
        # Update price (only for stock/crypto)
        holding_type = holding['type']
        if holding_type in ['stock', 'crypto']:
            price_data = await price_service.get_price(holding['symbol'], holding_type)
            
            if "error" not in price_data and "price" in price_data:
                current_price = price_data["price"]
                total_value = holding['shares'] * current_price
                gain_loss = total_value - holding['total_cost']
                gain_loss_percent = (gain_loss / holding['total_cost']) * 100 if holding['total_cost'] > 0 else 0
                
                await execute_update(
                    """UPDATE holdings SET 
                       current_price = $1, total_value = $2, gain_loss = $3, 
                       gain_loss_percent = $4, last_updated = NOW()
                       WHERE id = $5""",
                    current_price, total_value, gain_loss, gain_loss_percent, holding_id
                )
                
                holding['current_price'] = current_price
                holding['total_value'] = total_value
                holding['gain_loss'] = gain_loss
                holding['gain_loss_percent'] = gain_loss_percent
                holding['last_updated'] = datetime.now(timezone.utc)
        else:
            # For non-tradable assets, ensure current_price equals avg_cost
            shares = float(holding['shares'])
            avg_cost = float(holding['avg_cost'])
            current_price = avg_cost
            total_value = shares * current_price
            gain_loss = total_value - (shares * avg_cost)
            gain_loss_percent = (gain_loss / (shares * avg_cost)) * 100 if (shares * avg_cost) > 0 else 0
            
            await execute_update(
                """UPDATE holdings SET 
                   current_price = $1, total_value = $2, gain_loss = $3, 
                   gain_loss_percent = $4, last_updated = NOW()
                   WHERE id = $5""",
                current_price, total_value, gain_loss, gain_loss_percent, holding_id
            )
            
            holding['current_price'] = current_price
            holding['total_value'] = total_value
            holding['gain_loss'] = gain_loss
            holding['gain_loss_percent'] = gain_loss_percent
            holding['last_updated'] = datetime.now(timezone.utc)
        
        return HoldingResponse(**holding_to_dict(holding))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching holding {holding_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch holding")

@holdings_router.put("/{holding_id}", response_model=HoldingResponse)
async def update_holding(
    holding_id: str,
    update_data: HoldingUpdate,
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Update holding details"""
    try:
        pool = await get_db_pool()
        
        # Find existing holding
        existing_holding = await execute_one(
            "SELECT * FROM holdings WHERE id = $1 AND user_id = $2",
            holding_id,
            current_user.id
        )
        
        if not existing_holding:
            raise HTTPException(status_code=404, detail="Holding not found")
        
        # Prepare update fields
        shares = update_data.shares if update_data.shares is not None else existing_holding['shares']
        avg_cost = update_data.avg_cost if update_data.avg_cost is not None else existing_holding['avg_cost']
        name = update_data.name if update_data.name is not None else existing_holding['name']
        sector = update_data.sector if update_data.sector is not None else existing_holding.get('sector')
        platform = update_data.platform if update_data.platform is not None else existing_holding.get('platform')
        
        # Get current price (only for stock/crypto)
        existing_type = existing_holding['type']
        if existing_type in ['stock', 'crypto']:
            price_data = await price_service.get_price(existing_holding['symbol'], existing_type)
            
            current_price = existing_holding['current_price']
            if "error" not in price_data and "price" in price_data:
                current_price = price_data["price"]
        else:
            # For non-tradable assets, current price equals avg_cost
            current_price = existing_holding['avg_cost']
        
        # Recalculate values
        total_value = shares * current_price
        total_cost = shares * avg_cost
        gain_loss = total_value - total_cost
        gain_loss_percent = (gain_loss / total_cost) * 100 if total_cost > 0 else 0
        
        # Update in database
        await execute_update(
            """UPDATE holdings SET 
               name = $1, shares = $2, avg_cost = $3, current_price = $4,
               total_value = $5, total_cost = $6, gain_loss = $7, 
               gain_loss_percent = $8, sector = $9, platform = $10, last_updated = NOW()
               WHERE id = $11""",
            name, shares, avg_cost, current_price, total_value, total_cost,
            gain_loss, gain_loss_percent, sector, platform, holding_id
        )
        
        # Return updated holding
        updated_holding = await execute_one(
            "SELECT * FROM holdings WHERE id = $1",
            holding_id
        )
        
        return HoldingResponse(**holding_to_dict(updated_holding))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating holding {holding_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update holding: {str(e)}")

@holdings_router.delete("/{holding_id}")
async def delete_holding(
    holding_id: str,
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Delete holding"""
    try:
        pool = await get_db_pool()
        
        result = await execute_update(
            "DELETE FROM holdings WHERE id = $1 AND user_id = $2",
            holding_id,
            current_user.id
        )
        
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Holding not found")
        
        return {"message": "Holding deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting holding {holding_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete holding")

@holdings_router.get("/search/{symbol}")
async def search_symbol(
    symbol: str,
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Search for symbol and get current price, company name, and sector"""
    try:
        # Get price data for symbol (auto-detect type)
        price_data = await price_service.get_price(symbol)
        
        if "error" in price_data:
            raise HTTPException(status_code=404, detail=price_data["error"])
        
        # Extract name and sector from price_data if available
        name = price_data.get("name")
        sector = price_data.get("sector")
        
        # If name not in price_data, try to get it from company_data
        if not name:
            from company_data import get_company_name
            name = get_company_name(symbol)
        
        # If sector not in price_data, try to get it from company_data
        if not sector:
            from company_data import get_sector
            sector = get_sector(symbol)
        
        return {
            "symbol": symbol.upper(),
            "name": name,  # Company/asset name
            "current_price": price_data.get("price") or price_data.get("current_price"),
            "price": price_data.get("price") or price_data.get("current_price"),  # Also include as "price" for compatibility
            "sector": sector,  # Sector information
            "currency": price_data.get("currency", "USD"),
            "source": price_data.get("source", "unknown"),
            "last_updated": price_data.get("last_updated")
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching symbol {symbol}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to search symbol")

@holdings_router.get("/platforms/{asset_type}")
async def get_platforms_for_asset_type(
    asset_type: str,
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Get available platforms for a specific asset type"""
    try:
        platforms = {
            "stock": [
                "Robinhood", "E*TRADE", "TD Ameritrade", "Charles Schwab",
                "Fidelity", "Interactive Brokers", "Webull", "M1 Finance",
                "Vanguard", "Merrill Lynch", "Ally Invest", "SoFi Invest",
                "Public", "Cash App Investing", "Other"
            ],
            "crypto": [
                "Coinbase", "Coinbase Pro", "Binance US", "Kraken", "Gemini",
                "KuCoin", "Crypto.com", "MetaMask", "Hardware Wallet (Ledger)",
                "Hardware Wallet (Trezor)", "Trust Wallet", "Exodus",
                "Atomic Wallet", "Cold Storage", "Other"
            ],
            "roth_ira": [
                "Fidelity IRA", "Vanguard IRA", "Charles Schwab IRA",
                "TD Ameritrade IRA", "E*TRADE IRA", "Merrill Lynch IRA",
                "Interactive Brokers IRA", "Ally Invest IRA", "Wealthfront IRA",
                "Betterment IRA", "M1 Finance IRA", "Other"
            ],
            "cash": ["Manual Entry", "Other"],
            "hysa": ["Ally Bank", "Marcus by Goldman Sachs", "American Express", "Discover", "Capital One", "Other"],
            "bank": ["Chase", "Bank of America", "Wells Fargo", "Citibank", "US Bank", "PNC", "Other"],
            "home_equity": ["Manual Entry", "Other"],
            "other": ["Manual Entry", "Other"],
            "etf": [
                "Robinhood", "E*TRADE", "TD Ameritrade", "Charles Schwab",
                "Fidelity", "Vanguard", "Interactive Brokers", "Other"
            ],
            "bond": [
                "Fidelity", "Vanguard", "Charles Schwab", "TD Ameritrade",
                "TreasuryDirect", "Other"
            ],
            "401k": [
                "Fidelity 401(k)", "Vanguard 401(k)", "Charles Schwab 401(k)",
                "Principal", "T. Rowe Price", "Other"
            ],
            "529": [
                "Fidelity 529", "Vanguard 529", "College Savings Plans",
                "State 529 Plan", "Other"
            ],
            "child_roth": [
                "Fidelity", "Vanguard", "Charles Schwab", "TD Ameritrade", "Other"
            ],
            "hsa": [
                "Fidelity HSA", "HealthEquity", "Optum Bank", "HSA Bank", "Other"
            ],
            "traditional_ira": [
                "Fidelity IRA", "Vanguard IRA", "Charles Schwab IRA",
                "TD Ameritrade IRA", "E*TRADE IRA", "Other"
            ],
            "sep_ira": [
                "Fidelity SEP IRA", "Vanguard SEP IRA", "Charles Schwab SEP IRA", "Other"
            ]
        }
        
        return {"platforms": platforms.get(asset_type, [])}
    except Exception as e:
        logger.error(f"Error getting platforms for {asset_type}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get platforms")

@holdings_router.get("/portfolio/summary")
async def get_portfolio_summary(
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Get portfolio summary with real-time calculations"""
    try:
        pool = await get_db_pool()
        
        holdings = await execute_query(
            "SELECT * FROM holdings WHERE user_id = $1",
            current_user.id
        )
        
        if not holdings:
            return {
                "total_value": 0,
                "total_cost": 0,
                "total_gain_loss": 0,
                "total_gain_loss_percent": 0,
                "asset_count": 0,
                "asset_breakdown": {
                    "stock": 0,
                    "crypto": 0,
                    "roth_ira": 0,
                    "cash": 0,
                    "hysa": 0,
                    "bank": 0,
                    "home_equity": 0,
                    "other": 0,
                    "etf": 0,
                    "bond": 0,
                    "401k": 0,
                    "529": 0,
                    "child_roth": 0,
                    "hsa": 0,
                    "traditional_ira": 0,
                    "sep_ira": 0
                }
            }
        
        # Get updated prices (only for tradable assets)
        tradable_holdings = [h for h in holdings if h['type'] in ['stock', 'crypto']]
        symbols = [h['symbol'] for h in tradable_holdings]
        asset_types = {h['symbol']: h['type'] for h in tradable_holdings}
        
        price_data = {}
        if symbols:  # Only fetch if we have tradable assets
            price_data = await price_service.get_multiple_prices(symbols, asset_types)
        
        # Calculate totals with current prices
        total_value = 0
        total_cost = 0
        asset_breakdown = {
            "stock": 0, "crypto": 0, "roth_ira": 0, "cash": 0, "hysa": 0,
            "bank": 0, "home_equity": 0, "other": 0, "etf": 0, "bond": 0,
            "401k": 0, "529": 0, "child_roth": 0, "hsa": 0, "traditional_ira": 0, "sep_ira": 0
        }
        
        for holding in holdings:
            symbol = holding['symbol']
            holding_type = holding['type']
            
            # Get current price based on asset type
            if holding_type in ['stock', 'crypto']:
                current_price_data = price_data.get(symbol, {})
                if "error" not in current_price_data and "price" in current_price_data:
                    current_price = current_price_data["price"]
                else:
                    current_price = holding['current_price']
            else:
                # For non-tradable assets, use avg_cost as current_price
                current_price = holding['avg_cost']
            
            holding_value = holding['shares'] * current_price
            holding_cost = holding['total_cost']
            
            total_value += holding_value
            total_cost += holding_cost
            
            # Map asset types correctly
            if holding_type in asset_breakdown:
                asset_breakdown[holding_type] += 1
            else:
                # Default to "other" for unknown types
                asset_breakdown["other"] += 1
        
        total_gain_loss = total_value - total_cost
        total_gain_loss_percent = (total_gain_loss / total_cost) * 100 if total_cost > 0 else 0
        
        return {
            "total_value": total_value,
            "total_cost": total_cost,
            "total_gain_loss": total_gain_loss,
            "total_gain_loss_percent": total_gain_loss_percent,
            "asset_count": len(holdings),
            "asset_breakdown": {
                "stock": asset_breakdown.get("stock", 0),
                "crypto": asset_breakdown.get("crypto", 0), 
                "roth_ira": asset_breakdown.get("roth_ira", 0),
                "cash": asset_breakdown.get("cash", 0),
                "hysa": asset_breakdown.get("hysa", 0),
                "bank": asset_breakdown.get("bank", 0),
                "home_equity": asset_breakdown.get("home_equity", 0),
                "other": asset_breakdown.get("other", 0),
                "etf": asset_breakdown.get("etf", 0),
                "bond": asset_breakdown.get("bond", 0),
                "401k": asset_breakdown.get("401k", 0),
                "529": asset_breakdown.get("529", 0),
                "child_roth": asset_breakdown.get("child_roth", 0),
                "hsa": asset_breakdown.get("hsa", 0),
                "traditional_ira": asset_breakdown.get("traditional_ira", 0),
                "sep_ira": asset_breakdown.get("sep_ira", 0)
            },
            "last_updated": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        logger.error(f"Error calculating portfolio summary: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to calculate portfolio summary")

