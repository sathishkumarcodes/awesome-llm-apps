"""
Robinhood integration for importing holdings
Supports CSV import and future SnapTrade API integration
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
import csv
import io
import logging
from datetime import datetime, timezone
from auth import get_current_user_dependency, UserData
from holdings import holdings_router, HoldingCreate
from price_service import price_service
from db_supabase import get_db_pool, execute_insert, execute_update, execute_query, execute_one

logger = logging.getLogger(__name__)

robinhood_router = APIRouter(prefix="/robinhood", tags=["robinhood"])

class RobinhoodConnection(BaseModel):
    connected: bool
    last_sync: Optional[str] = None
    holdings_count: int = 0

class ImportResult(BaseModel):
    success: bool
    imported: int
    failed: int
    errors: List[str] = []

def parse_robinhood_csv(csv_content: str) -> List[dict]:
    """Parse Robinhood CSV export and convert to holdings format"""
    holdings = []
    errors = []
    
    try:
        # Read CSV content
        csv_reader = csv.DictReader(io.StringIO(csv_content))
        
        for row_num, row in enumerate(csv_reader, start=2):  # Start at 2 (header is row 1)
            try:
                # Robinhood CSV typically has columns like:
                # Symbol, Name, Quantity, Average Cost, Current Price, etc.
                symbol = row.get('Symbol', row.get('symbol', '')).strip().upper()
                name = row.get('Name', row.get('name', row.get('Instrument', ''))).strip()
                quantity = row.get('Quantity', row.get('quantity', row.get('Shares', '0'))).strip()
                avg_cost = row.get('Average Cost', row.get('average_cost', row.get('Cost Basis', '0'))).strip()
                
                # Handle different column name variations
                if not symbol:
                    symbol = row.get('Ticker', '').strip().upper()
                if not name:
                    name = row.get('Security', '').strip()
                if not quantity:
                    quantity = row.get('Shares', row.get('Qty', '0')).strip()
                if not avg_cost:
                    avg_cost = row.get('Cost Basis Per Share', row.get('Avg Price', '0')).strip()
                
                # Skip empty rows
                if not symbol or not quantity:
                    continue
                
                # Parse numeric values
                try:
                    shares = float(quantity.replace(',', ''))
                    cost_per_share = float(avg_cost.replace('$', '').replace(',', ''))
                except (ValueError, AttributeError) as e:
                    errors.append(f"Row {row_num}: Invalid numeric values for {symbol}")
                    continue
                
                # Determine asset type using normalization utility
                from asset_type_utils import normalize_asset_type
                
                asset_type = 'stock'  # Default
                name_upper = name.upper() if name else ''
                if symbol in ['BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'MATIC', 'LINK', 'UNI']:
                    asset_type = 'crypto'
                elif 'ETF' in name_upper or symbol.endswith('ETF'):
                    asset_type = 'etf'
                elif 'IRA' in name_upper or 'ROTH' in name_upper:
                    asset_type = 'roth_ira'
                elif '401K' in name_upper or '401(K)' in name_upper:
                    asset_type = '401k'
                elif '529' in name_upper:
                    asset_type = '529'
                elif 'BOND' in name_upper:
                    asset_type = 'bond'
                
                # Normalize to ensure it's valid
                asset_type = normalize_asset_type(asset_type)
                
                # Extract sector if available
                sector = row.get('Sector', row.get('sector', '')).strip() or None
                
                holdings.append({
                    'symbol': symbol,
                    'name': name or symbol,
                    'type': asset_type,
                    'shares': shares,
                    'avg_cost': cost_per_share,
                    'sector': sector,
                    'platform': 'Robinhood'
                })
                
            except Exception as e:
                errors.append(f"Row {row_num}: Error parsing row - {str(e)}")
                logger.warning(f"Error parsing Robinhood CSV row {row_num}: {str(e)}")
                continue
        
        return holdings, errors
        
    except Exception as e:
        logger.error(f"Error parsing Robinhood CSV: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")

@robinhood_router.post("/import/csv")
async def import_robinhood_csv(
    file: UploadFile = File(...),
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Import holdings from Robinhood CSV export"""
    try:
        # Check if user is logged in
        if current_user.id == "mock_user_123" or len(current_user.id) < 32:
            raise HTTPException(
                status_code=401,
                detail="Please log in to import holdings"
            )
        
        # Read CSV file
        contents = await file.read()
        csv_content = contents.decode('utf-8')
        
        # Parse CSV
        holdings_data, parse_errors = parse_robinhood_csv(csv_content)
        
        if not holdings_data:
            raise HTTPException(
                status_code=400,
                detail="No valid holdings found in CSV file. Please check the file format."
            )
        
        # DELTA IMPORT: Get existing holdings for this platform
        pool = await get_db_pool()
        existing_holdings = await execute_query(
            "SELECT symbol FROM holdings WHERE user_id = $1 AND platform = $2",
            current_user.id,
            'Robinhood'
        )
        existing_symbols = {h['symbol'] for h in existing_holdings}
        new_symbols = {h['symbol'] for h in holdings_data}
        
        # Symbols to delete (in DB but not in new file)
        symbols_to_delete = existing_symbols - new_symbols
        
        # Import holdings (add new + update existing)
        imported_count = 0
        updated_count = 0
        added_count = 0
        failed_count = 0
        deleted_count = 0
        import_errors = []
        
        for holding_data in holdings_data:
            try:
                # Get current price (only for stock/crypto)
                from asset_type_utils import normalize_asset_type
                asset_type = normalize_asset_type(holding_data['type'])
                
                # Only fetch price for tradable assets
                if asset_type in ['stock', 'crypto']:
                    price_data = await price_service.get_price(holding_data['symbol'], asset_type)
                else:
                    # For non-tradable assets, use avg_cost as current_price
                    price_data = {'price': holding_data['avg_cost']}
                
                if "error" in price_data:
                    # Use average cost as fallback if price fetch fails
                    current_price = holding_data['avg_cost']
                else:
                    current_price = float(price_data.get('price', price_data.get('current_price', holding_data['avg_cost'])))
                
                # Calculate values
                total_value = holding_data['shares'] * current_price
                total_cost = holding_data['shares'] * holding_data['avg_cost']
                gain_loss = total_value - total_cost
                gain_loss_percent = (gain_loss / total_cost) * 100 if total_cost > 0 else 0
                
                # Check if holding already exists
                existing = await execute_query(
                    "SELECT id FROM holdings WHERE user_id = $1 AND symbol = $2 AND platform = $3",
                    current_user.id,
                    holding_data['symbol'],
                    'Robinhood'
                )
                
                if existing:
                    # Update existing holding
                    await execute_one(
                        """UPDATE holdings SET 
                           name = $1, shares = $2, avg_cost = $3, current_price = $4,
                           total_value = $5, total_cost = $6, gain_loss = $7,
                           gain_loss_percent = $8, sector = $9, last_updated = NOW()
                           WHERE user_id = $10 AND symbol = $11 AND platform = $12
                           RETURNING *""",
                        holding_data['name'],
                        holding_data['shares'],
                        holding_data['avg_cost'],
                        current_price,
                        total_value,
                        total_cost,
                        gain_loss,
                        gain_loss_percent,
                        holding_data.get('sector'),
                        current_user.id,
                        holding_data['symbol'],
                        'Robinhood'
                    )
                    updated_count += 1
                else:
                    # Insert new holding
                    await execute_insert(
                        """INSERT INTO holdings 
                           (user_id, symbol, name, type, shares, avg_cost, current_price, total_value, 
                            total_cost, gain_loss, gain_loss_percent, sector, platform)
                           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                           RETURNING *""",
                        current_user.id,
                        holding_data['symbol'],
                        holding_data['name'],
                        normalize_asset_type(holding_data['type']),  # Normalize asset type
                        holding_data['shares'],
                        holding_data['avg_cost'],
                        current_price,
                        total_value,
                        total_cost,
                        gain_loss,
                        gain_loss_percent,
                        holding_data.get('sector'),
                        'Robinhood'
                    )
                    added_count += 1
                
                imported_count += 1
                
            except Exception as e:
                failed_count += 1
                error_msg = f"Failed to import {holding_data.get('symbol', 'unknown')}: {str(e)}"
                import_errors.append(error_msg)
                logger.error(error_msg)
        
        # Delete holdings not in new file
        if symbols_to_delete:
            try:
                deleted_result = await execute_query(
                    "DELETE FROM holdings WHERE user_id = $1 AND platform = $2 AND symbol = ANY($3::text[]) RETURNING symbol",
                    current_user.id,
                    'Robinhood',
                    list(symbols_to_delete)
                )
                deleted_count = len(deleted_result) if deleted_result else 0
                logger.info(f"Deleted {deleted_count} holdings not in new file: {list(symbols_to_delete)}")
            except Exception as e:
                logger.error(f"Error deleting old holdings: {str(e)}")
                import_errors.append(f"Failed to delete old holdings: {str(e)}")
        
        all_errors = parse_errors + import_errors
        
        return ImportResult(
            success=imported_count > 0 or deleted_count > 0,
            imported=imported_count + deleted_count,  # Include deleted count in total
            failed=failed_count,
            errors=all_errors[:10]  # Limit to first 10 errors
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error importing Robinhood CSV: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to import CSV: {str(e)}")

@robinhood_router.get("/status")
async def get_robinhood_status(
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Get Robinhood connection status"""
    try:
        if current_user.id == "mock_user_123" or len(current_user.id) < 32:
            return RobinhoodConnection(connected=False, holdings_count=0)
        
        pool = await get_db_pool()
        
        # Count Robinhood holdings
        holdings = await execute_query(
            "SELECT COUNT(*) as count, MAX(last_updated) as last_sync FROM holdings WHERE user_id = $1 AND platform = $2",
            current_user.id,
            'Robinhood'
        )
        
        count = holdings[0]['count'] if holdings else 0
        last_sync = holdings[0]['last_sync'] if holdings and holdings[0]['last_sync'] else None
        
        return RobinhoodConnection(
            connected=count > 0,
            last_sync=last_sync.isoformat() if last_sync else None,
            holdings_count=count
        )
    except Exception as e:
        logger.error(f"Error getting Robinhood status: {str(e)}")
        return RobinhoodConnection(connected=False, holdings_count=0)

@robinhood_router.delete("/disconnect")
async def disconnect_robinhood(
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Remove all Robinhood holdings (disconnect account)"""
    try:
        if current_user.id == "mock_user_123" or len(current_user.id) < 32:
            raise HTTPException(status_code=401, detail="Please log in")
        
        pool = await get_db_pool()
        
        # Delete all Robinhood holdings
        await execute_one(
            "DELETE FROM holdings WHERE user_id = $1 AND platform = $2 RETURNING id",
            current_user.id,
            'Robinhood'
        )
        
        return {"success": True, "message": "Robinhood holdings removed"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disconnecting Robinhood: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to disconnect: {str(e)}")

