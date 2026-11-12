"""
Fidelity Investments API integration for importing holdings
Note: Fidelity doesn't have a public API, so this uses OAuth-based authentication
or requires users to export their data manually via CSV
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
import logging
import httpx
import csv
import io
import os
from datetime import datetime, timezone
from auth import get_current_user_dependency, UserData
from price_service import price_service
from db_supabase import get_db_pool, execute_insert, execute_query, execute_one

logger = logging.getLogger(__name__)

fidelity_router = APIRouter(prefix="/fidelity", tags=["fidelity"])

class FidelityConnection(BaseModel):
    connected: bool
    last_sync: Optional[str] = None
    holdings_count: int = 0
    error: Optional[str] = None

class ImportResult(BaseModel):
    success: bool
    imported: int
    failed: int
    errors: List[str] = []

def parse_fidelity_csv(csv_content: str) -> tuple:
    """Parse Fidelity CSV export and convert to holdings format"""
    holdings = []
    errors = []
    
    try:
        csv_reader = csv.DictReader(io.StringIO(csv_content))
        
        def safe_get(row, key_variants, default=''):
            """Safely get value from row, handling None"""
            for key in key_variants:
                val = row.get(key)
                if val is not None and str(val).strip():
                    return str(val).strip()
            return default
        
        # Log available columns for debugging
        try:
            # Read first row to get column names
            csv_reader_peek = csv.DictReader(io.StringIO(csv_content))
            first_row = next(csv_reader_peek)
            available_columns = list(first_row.keys()) if first_row else []
            logger.info(f"Fidelity CSV columns found: {available_columns}")
            # Reset reader
            csv_reader = csv.DictReader(io.StringIO(csv_content))
        except StopIteration:
            logger.warning("Fidelity CSV appears to be empty or has no header row")
            return holdings, errors
        
        for row_num, row in enumerate(csv_reader, start=2):
            try:
                # Skip if row is None or empty
                if not row:
                    continue
                
                # Fidelity CSV typically has columns like:
                # Symbol, Description, Quantity, Last Price, Current Value, etc.
                # Handle None values from CSV (empty cells)
                
                # Try multiple column name variations (case-insensitive matching)
                symbol = ''
                for col in row.keys():
                    if col and col.upper() in ['SYMBOL', 'TICKER', 'TICKER SYMBOL']:
                        symbol = str(row[col]).strip().upper() if row[col] else ''
                        break
                if not symbol:
                    # Try direct access with safe_get
                    symbol = safe_get(row, ['Symbol', 'symbol', 'Ticker', 'ticker', 'Ticker Symbol'], '').upper()
                
                name = safe_get(row, ['Description', 'description', 'Security Name', 'Security', 'Name', 'name', 'Security Description'], '')
                quantity = safe_get(row, ['Quantity', 'quantity', 'Shares', 'shares', 'Qty', 'qty', 'Number of Shares'], '0')
                
                # Try to get cost basis
                cost_basis = safe_get(row, ['Cost Basis', 'cost_basis', 'Total Cost', 'total_cost', 'Cost', 'cost', 'Cost Basis Total'], '0')
                current_value = safe_get(row, ['Current Value', 'current_value', 'Market Value', 'market_value', 'Value', 'value', 'Total Value'], '0')
                last_price = safe_get(row, ['Last Price', 'last_price', 'Price', 'price', 'Current Price', 'current_price', 'Last', 'Close'], '0')
                
                # Skip empty rows - but be more lenient
                if not symbol:
                    # Log for debugging
                    if row_num <= 5:  # Only log first few rows
                        logger.debug(f"Row {row_num}: Skipping - no symbol found. Row keys: {list(row.keys())}")
                    continue
                
                # If quantity is missing or 0, try to calculate from value/price
                if not quantity or quantity == '0':
                    if current_value and current_value != '0' and last_price and last_price != '0':
                        try:
                            val = float(current_value.replace('$', '').replace(',', '').strip())
                            price = float(last_price.replace('$', '').replace(',', '').strip())
                            if price > 0:
                                quantity = str(val / price)
                        except:
                            pass
                
                if not quantity or quantity == '0':
                    if row_num <= 5:
                        logger.debug(f"Row {row_num}: Skipping {symbol} - no quantity found")
                    continue
                
                # Parse numeric values
                try:
                    # Clean and parse quantity
                    quantity_clean = quantity.replace(',', '').replace('$', '').strip()
                    if not quantity_clean or quantity_clean == '':
                        continue
                    shares = float(quantity_clean)
                    
                    if shares <= 0:
                        continue
                    
                    # Clean price for later use
                    last_price_clean = last_price.replace('$', '').replace(',', '').strip() if last_price else ''
                    
                    # Calculate average cost
                    cost_basis_clean = cost_basis.replace('$', '').replace(',', '').strip() if cost_basis else ''
                    if cost_basis_clean and cost_basis_clean != '':
                        total_cost = float(cost_basis_clean)
                        avg_cost = total_cost / shares if shares > 0 else 0
                    else:
                        # If no cost basis, try to estimate from current value
                        current_value_clean = current_value.replace('$', '').replace(',', '').strip() if current_value else ''
                        if current_value_clean and current_value_clean != '':
                            total_value = float(current_value_clean)
                            if last_price_clean and last_price_clean != '':
                                price = float(last_price_clean)
                                avg_cost = price  # Use current price as estimate
                            else:
                                avg_cost = total_value / shares if shares > 0 else 0
                        else:
                            # If we have a price but no cost basis, use price as estimate
                            if last_price_clean and last_price_clean != '':
                                avg_cost = float(last_price_clean)
                            else:
                                avg_cost = 0
                except (ValueError, AttributeError, ZeroDivisionError, TypeError) as e:
                    errors.append(f"Row {row_num}: Invalid numeric values for {symbol or 'unknown'}: {str(e)}")
                    continue
                
                # Determine asset type using normalization utility
                from asset_type_utils import normalize_asset_type
                
                # Try to determine from name/symbol
                asset_type = 'stock'  # Default
                name_upper = name.upper() if name else ''
                if 'ETF' in name_upper or symbol.endswith('ETF'):
                    asset_type = 'etf'
                elif 'IRA' in name_upper or 'ROTH' in name_upper:
                    asset_type = 'roth_ira'
                elif '401K' in name_upper or '401(K)' in name_upper:
                    asset_type = '401k'
                elif '529' in name_upper:
                    asset_type = '529'
                elif 'HSA' in name_upper:
                    asset_type = 'hsa'
                elif 'BOND' in name_upper:
                    asset_type = 'bond'
                
                # Normalize to ensure it's valid
                asset_type = normalize_asset_type(asset_type)
                
                # Extract sector if available
                sector = safe_get(row, ['Sector', 'sector'], '') or None
                
                # Ensure avg_cost is never 0 (database constraint)
                # If avg_cost is 0, use current price as fallback
                if avg_cost <= 0:
                    if last_price_clean and last_price_clean != '':
                        try:
                            avg_cost = float(last_price_clean)
                        except:
                            avg_cost = 0.01  # Minimum fallback
                    else:
                        avg_cost = 0.01  # Minimum fallback to satisfy database constraint
                
                holdings.append({
                    'symbol': symbol,
                    'name': name or symbol,
                    'type': asset_type,
                    'shares': shares,
                    'avg_cost': avg_cost,
                    'sector': sector,
                    'platform': 'Fidelity'
                })
                
            except Exception as e:
                errors.append(f"Row {row_num}: Error parsing row - {str(e)}")
                logger.warning(f"Error parsing Fidelity CSV row {row_num}: {str(e)}")
                continue
        
        return holdings, errors
        
    except Exception as e:
        logger.error(f"Error parsing Fidelity CSV: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")

@fidelity_router.post("/import/csv")
async def import_fidelity_csv(
    file: UploadFile = File(...),
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Import holdings from Fidelity CSV export"""
    try:
        if current_user.id == "mock_user_123" or len(current_user.id) < 32:
            raise HTTPException(status_code=401, detail="Please log in")
        
        # Read CSV file
        contents = await file.read()
        csv_content = contents.decode('utf-8')
        
        # Parse CSV
        holdings_data, parse_errors = parse_fidelity_csv(csv_content)
        
        logger.info(f"Parsed {len(holdings_data)} holdings, {len(parse_errors)} errors")
        
        if not holdings_data:
            error_detail = "No valid holdings found in CSV file."
            if parse_errors:
                error_detail += f" Parsing errors: {', '.join(parse_errors[:5])}"
            else:
                error_detail += " Please check that your CSV file contains columns like: Symbol, Quantity, Cost Basis, etc. Check backend logs for detected columns."
            raise HTTPException(
                status_code=400,
                detail=error_detail
            )
        
        # DELTA IMPORT: Get existing holdings for this platform
        pool = await get_db_pool()
        existing_holdings = await execute_query(
            "SELECT symbol FROM holdings WHERE user_id = $1 AND platform = $2",
            current_user.id,
            'Fidelity'
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
                # Get current price
                asset_type = holding_data['type'] if holding_data['type'] != 'roth_ira' else 'stock'
                price_data = await price_service.get_price(holding_data['symbol'], asset_type)
                
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
                    'Fidelity'
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
                        'Fidelity'
                    )
                    updated_count += 1
                else:
                    # Insert new holding
                    # Normalize asset type before insert
                    normalized_type = normalize_asset_type(holding_data['type'])
                    
                    await execute_insert(
                        """INSERT INTO holdings 
                           (user_id, symbol, name, type, shares, avg_cost, current_price, total_value, 
                            total_cost, gain_loss, gain_loss_percent, sector, platform)
                           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                           RETURNING *""",
                        current_user.id,
                        holding_data['symbol'],
                        holding_data['name'],
                        normalized_type,  # Use normalized type
                        holding_data['shares'],
                        holding_data['avg_cost'],
                        current_price,
                        total_value,
                        total_cost,
                        gain_loss,
                        gain_loss_percent,
                        holding_data.get('sector'),
                        'Fidelity'
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
                    'Fidelity',
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
            errors=all_errors[:10]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error importing Fidelity CSV: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to import CSV: {str(e)}")

@fidelity_router.get("/status")
async def get_fidelity_status(
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Get Fidelity connection status"""
    try:
        if current_user.id == "mock_user_123" or len(current_user.id) < 32:
            return FidelityConnection(connected=False, holdings_count=0)
        
        pool = await get_db_pool()
        
        # Count Fidelity holdings
        holdings = await execute_query(
            "SELECT COUNT(*) as count, MAX(last_updated) as last_sync FROM holdings WHERE user_id = $1 AND platform = $2",
            current_user.id,
            'Fidelity'
        )
        
        count = holdings[0]['count'] if holdings else 0
        last_sync = holdings[0]['last_sync'] if holdings and holdings[0]['last_sync'] else None
        
        return FidelityConnection(
            connected=count > 0,
            last_sync=last_sync.isoformat() if last_sync else None,
            holdings_count=count
        )
    except Exception as e:
        logger.error(f"Error getting Fidelity status: {str(e)}")
        return FidelityConnection(connected=False, holdings_count=0, error=str(e))

@fidelity_router.delete("/disconnect")
async def disconnect_fidelity(
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Remove all Fidelity holdings (disconnect account)"""
    try:
        if current_user.id == "mock_user_123" or len(current_user.id) < 32:
            raise HTTPException(status_code=401, detail="Please log in")
        
        pool = await get_db_pool()
        
        # Delete all Fidelity holdings
        await execute_one(
            "DELETE FROM holdings WHERE user_id = $1 AND platform = $2 RETURNING id",
            current_user.id,
            'Fidelity'
        )
        
        return {"success": True, "message": "Fidelity holdings removed"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disconnecting Fidelity: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to disconnect: {str(e)}")

