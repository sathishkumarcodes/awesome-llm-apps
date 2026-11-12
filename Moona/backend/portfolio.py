"""
Portfolio calculation and analytics endpoints
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict
import logging
import asyncio
from auth import get_current_user_dependency, UserData
from db_supabase import get_db_pool, execute_query
from price_service import price_service
from benchmark_service import benchmark_service
from projection_service import projection_service
import httpx
import json

logger = logging.getLogger(__name__)

portfolio_router = APIRouter(prefix="/portfolio", tags=["portfolio"])

class PortfolioSummary(BaseModel):
    costBasis: float
    currentValue: float
    gainLoss: float
    returnPct: float
    totalHoldings: int
    totalReturnPct: float
    bestPerformer: Optional[Dict]
    assetTypeCount: int
    lastUpdated: str

class TimeSeriesPoint(BaseModel):
    date: str
    value: float

class PortfolioPerformance(BaseModel):
    portfolioPerformance: List[TimeSeriesPoint]
    assetTypePerformance: List[Dict]
    monthlyContributions: List[TimeSeriesPoint]
    portfolioVsSpy: List[Dict]

class AllocationData(BaseModel):
    assetTypeAllocation: List[Dict]
    sectorAllocation: List[Dict]
    allocationSummary: Dict

class SPYComparison(BaseModel):
    spyValue: float
    spyReturnPct: float
    outperformancePct: float
    outperformanceValue: float
    portfolioValue: float
    portfolioReturnPct: float
    spyInvested: Optional[float] = 0.0
    portfolioInvested: Optional[float] = 0.0
    timeSeries: Optional[List[Dict]] = []

async def calculate_portfolio_metrics(user_id: str) -> Dict:
    """Calculate all portfolio metrics from holdings"""
    try:
        # Skip if user_id is a mock user (not a valid UUID)
        if user_id == "mock_user_123" or len(user_id) < 32:
            return {
                "costBasis": 0.0,
                "currentValue": 0.0,
                "gainLoss": 0.0,
                "returnPct": 0.0,
                "totalHoldings": 0,
                "assetTypes": set(),
                "holdings": []
            }
        
        pool = await get_db_pool()
        
        # Fetch all holdings
        holdings = await execute_query(
            "SELECT * FROM holdings WHERE user_id = $1",
            user_id
        )
        
        if not holdings:
            return {
                "costBasis": 0.0,
                "currentValue": 0.0,
                "gainLoss": 0.0,
                "returnPct": 0.0,
                "totalHoldings": 0,
                "assetTypes": set(),
                "holdings": []
            }
        
        # Get current prices with shorter timeout - use cached/database prices if slow
        symbols = [h['symbol'] for h in holdings]
        asset_types = {h['symbol']: h['type'] if h['type'] != 'roth_ira' else 'stock' for h in holdings}
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
        
        # Calculate totals
        total_cost = 0.0
        total_value = 0.0
        asset_types_set = set()
        best_performer = None
        best_return = float('-inf')
        
        updated_holdings = []
        for holding in holdings:
            symbol = holding['symbol']
            
            # Get current price - handle both dict and float responses
            price_info = price_data.get(symbol, {})
            if isinstance(price_info, dict):
                current_price = float(price_info.get('price', price_info.get('current_price', holding.get('current_price', 0))))
            else:
                current_price = float(price_info) if price_info else float(holding.get('current_price', 0))
            
            # Convert database Decimal types to float
            total_cost_holding = float(holding['total_cost'])
            shares = float(holding['shares'])
            total_value_holding = shares * current_price
            
            gain_loss = total_value_holding - total_cost_holding
            return_pct = (gain_loss / total_cost_holding * 100) if total_cost_holding > 0 else 0
            
            total_cost += total_cost_holding
            total_value += total_value_holding
            asset_types_set.add(holding['type'])
            
            if return_pct > best_return:
                best_return = return_pct
                best_performer = {
                    "name": holding['name'],
                    "symbol": holding['symbol'],
                    "returnPct": return_pct,
                    "gainLoss": gain_loss,
                    "value": total_value_holding
                }
            
            # Convert all Decimal values to float for JSON serialization
            updated_holdings.append({
                "id": str(holding.get('id', '')),
                "symbol": holding.get('symbol', ''),
                "name": holding.get('name', ''),
                "type": holding.get('type', ''),
                "shares": shares,
                "avg_cost": float(holding.get('avg_cost', 0)),
                "current_price": current_price,
                "total_value": total_value_holding,
                "total_cost": total_cost_holding,
                "gain_loss": gain_loss,
                "gain_loss_percent": return_pct,
                "sector": holding.get('sector'),
                "platform": holding.get('platform'),
                "last_updated": holding.get('last_updated'),
                "created_at": holding.get('created_at')
            })
        
        total_gain_loss = total_value - total_cost
        total_return_pct = (total_gain_loss / total_cost * 100) if total_cost > 0 else 0
        
        return {
            "costBasis": total_cost,
            "currentValue": total_value,
            "gainLoss": total_gain_loss,
            "returnPct": total_return_pct,
            "totalHoldings": len(holdings),
            "assetTypes": asset_types_set,
            "bestPerformer": best_performer,
            "holdings": updated_holdings
        }
    except Exception as e:
        logger.error(f"Error calculating portfolio metrics: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to calculate portfolio: {str(e)}")

async def get_spy_data() -> Dict:
    """Get SPY (S&P 500) benchmark data"""
    try:
        # Get current SPY price
        spy_price_data = await price_service.get_price("SPY", "stock")
        current_spy_price = spy_price_data.get("price", 0)
        
        # For simplicity, assume SPY baseline (can be enhanced with historical data)
        # Using a typical SPY return of ~10% annually as baseline
        spy_baseline = current_spy_price * 0.9  # Approximate 10% gain
        spy_return_pct = 10.0  # Placeholder - can be calculated from historical data
        
        return {
            "spyValue": current_spy_price,
            "spyReturnPct": spy_return_pct,
            "spyBaseline": spy_baseline
        }
    except Exception as e:
        logger.warning(f"Failed to fetch SPY data: {str(e)}")
        return {
            "spyValue": 0.0,
            "spyReturnPct": 0.0,
            "spyBaseline": 0.0
        }

async def calculate_spy_comparison_with_dates(holdings: List[Dict]) -> Dict:
    """Calculate what SPY would be worth if invested at the same times as portfolio holdings"""
    try:
        # Get current SPY price - try multiple times if needed
        current_spy_price = 0.0
        spy_price_data = {}
        
        try:
            spy_price_data = await price_service.get_price("SPY", "stock")
            if isinstance(spy_price_data, dict):
                current_spy_price = float(spy_price_data.get("price", spy_price_data.get("current_price", 0)))
            else:
                current_spy_price = float(spy_price_data) if spy_price_data else 0.0
        except Exception as e:
            logger.warning(f"Failed to get SPY price from API: {str(e)}")
        
        # Fallback to approximate current SPY price if API fails
        if current_spy_price == 0:
            current_spy_price = 450.0  # Approximate current SPY price
            logger.info(f"Using fallback SPY price: ${current_spy_price}")
        
        if not holdings:
            logger.warning("No holdings provided for SPY comparison")
            return {
                "spyValue": 0.0,
                "spyInvested": 0.0,
                "spyReturnPct": 0.0,
                "portfolioInvested": 0.0,
                "timeSeries": []
            }
        
        logger.info(f"Calculating SPY comparison for {len(holdings)} holdings with SPY price: ${current_spy_price}")
        
        # Calculate SPY investment based on when each holding was purchased
        spy_invested = 0.0
        portfolio_invested = 0.0
        spy_value = 0.0
        time_series = []
        
        now = datetime.now(timezone.utc)
        
        # Group investments by month for time series
        monthly_data = {}
        
        for holding in holdings:
            # Get investment amount (total_cost = cost basis = money spent)
            investment = float(holding.get('total_cost', 0))
            if investment <= 0:
                logger.warning(f"Skipping holding {holding.get('symbol', 'unknown')} with zero or negative cost basis")
                continue
            portfolio_invested += investment
            
            # Get when this holding was created (investment date)
            created_at = holding.get('created_at')
            if isinstance(created_at, str):
                try:
                    created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                except:
                    created_at = now - timedelta(days=365)  # Default to 1 year ago
            elif not isinstance(created_at, datetime):
                created_at = now - timedelta(days=365)
            
            # Calculate days since investment
            days_since_investment = (now - created_at.replace(tzinfo=timezone.utc) if created_at.tzinfo is None else created_at).days
            days_since_investment = max(days_since_investment, 1)  # At least 1 day
            
            # Estimate SPY price at investment date
            # SPY has historically returned ~10% annually, so we can approximate
            # If invested X days ago, SPY would have been: current_price / (1 + annual_return)^(days/365)
            annual_return = 0.10  # 10% annual return
            years_ago = days_since_investment / 365.0
            spy_price_at_investment = current_spy_price / ((1 + annual_return) ** years_ago)
            
            # Calculate how many SPY shares could be bought with this investment (cost basis)
            spy_shares = investment / spy_price_at_investment if spy_price_at_investment > 0 else 0
            
            # Current value of SPY investment (what those shares would be worth today)
            spy_investment_value = spy_shares * current_spy_price
            spy_invested += investment  # Total cost basis invested in SPY
            spy_value += spy_investment_value  # Total current value of SPY investment
            
            logger.debug(f"Holding {holding.get('symbol', 'unknown')}: invested ${investment:.2f} on {created_at.strftime('%Y-%m-%d')}, SPY price was ${spy_price_at_investment:.2f}, would have ${spy_shares:.4f} shares, worth ${spy_investment_value:.2f} today")
            
            # Add to monthly time series
            month_key = created_at.strftime("%Y-%m")
            if month_key not in monthly_data:
                monthly_data[month_key] = {
                    "portfolio_invested": 0.0,
                    "spy_invested": 0.0,
                    "spy_shares": 0.0,
                    "date": created_at
                }
            monthly_data[month_key]["portfolio_invested"] += investment
            monthly_data[month_key]["spy_invested"] += investment
            monthly_data[month_key]["spy_shares"] += spy_shares
        
        # Build time series - calculate cumulative values over time
        sorted_months = sorted(monthly_data.items())
        cumulative_portfolio = 0.0
        cumulative_spy_shares = 0.0
        
        for month_key, data in sorted_months:
            cumulative_portfolio += data["portfolio_invested"]
            cumulative_spy_shares += data["spy_shares"]
            
            # Calculate SPY value at this point in time
            # For historical points, estimate SPY price based on time elapsed
            investment_date = data["date"]
            days_from_investment = (now - investment_date.replace(tzinfo=timezone.utc) if investment_date.tzinfo is None else investment_date).days
            years_elapsed = days_from_investment / 365.0
            
            # Estimate SPY price at this historical point
            spy_price_at_date = current_spy_price / ((1 + annual_return) ** (days_from_investment / 365.0))
            spy_value_at_date = cumulative_spy_shares * spy_price_at_date
            
            # Portfolio value at this date (simplified - using cost basis with growth)
            portfolio_value_at_date = cumulative_portfolio * (1 + (years_elapsed * 0.10))  # Assume 10% growth
            
            time_series.append({
                "date": investment_date.strftime("%Y-%m-%d"),
                "portfolio": portfolio_value_at_date,
                "spy": spy_value_at_date
            })
        
        # Add current point
        portfolio_current = sum(float(h.get('total_value', 0)) for h in holdings)
        time_series.append({
            "date": now.strftime("%Y-%m-%d"),
            "portfolio": portfolio_current,
            "spy": spy_value
        })
        
        # Calculate SPY return percentage
        spy_return_pct = ((spy_value - spy_invested) / spy_invested * 100) if spy_invested > 0 else 0.0
        
        logger.info(f"SPY Comparison Result: Invested ${spy_invested:.2f}, Current Value ${spy_value:.2f}, Return {spy_return_pct:.2f}%")
        
        return {
            "spyValue": spy_value,
            "spyInvested": spy_invested,
            "spyReturnPct": spy_return_pct,
            "portfolioInvested": portfolio_invested,
            "timeSeries": time_series
        }
    except Exception as e:
        logger.error(f"Error calculating SPY comparison with dates: {str(e)}")
        return {
            "spyValue": 0.0,
            "spyInvested": 0.0,
            "spyReturnPct": 0.0,
            "portfolioInvested": 0.0,
            "timeSeries": []
        }

@portfolio_router.get("/summary")
async def get_portfolio_summary(
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Get portfolio summary with all KPIs"""
    try:
        metrics = await calculate_portfolio_metrics(current_user.id)
        
        return PortfolioSummary(
            costBasis=metrics["costBasis"],
            currentValue=metrics["currentValue"],
            gainLoss=metrics["gainLoss"],
            returnPct=metrics["returnPct"],
            totalHoldings=metrics["totalHoldings"],
            totalReturnPct=metrics["returnPct"],
            bestPerformer=metrics.get("bestPerformer"),
            assetTypeCount=len(metrics["assetTypes"]),
            lastUpdated=datetime.now(timezone.utc).isoformat()
        )
    except Exception as e:
        logger.error(f"Error getting portfolio summary: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get portfolio summary: {str(e)}")

@portfolio_router.get("/performance")
async def get_portfolio_performance(
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Get time-series performance data"""
    try:
        metrics = await calculate_portfolio_metrics(current_user.id)
        
        # Generate time series (last 12 months)
        portfolio_performance = []
        asset_type_performance = {}
        monthly_contributions = []
        
        # Group holdings by asset type
        asset_types = {}
        for holding in metrics["holdings"]:
            asset_type = holding.get("type", "stock")
            if asset_type not in asset_types:
                asset_types[asset_type] = []
            asset_types[asset_type].append(holding)
        
        # Generate monthly data points
        now = datetime.now(timezone.utc)
        for i in range(12):
            date = now - timedelta(days=30 * (11 - i))
            date_str = date.strftime("%Y-%m-%d")
            
            # Portfolio value (simplified - using current value with slight variation)
            portfolio_value = metrics["currentValue"] * (1 + (i * 0.02))  # Approximate growth
            portfolio_performance.append({
                "date": date_str,
                "value": portfolio_value
            })
            
            # Asset type performance
            for asset_type, holdings_list in asset_types.items():
                if asset_type not in asset_type_performance:
                    asset_type_performance[asset_type] = []
                type_value = sum(h.get("total_value", 0) for h in holdings_list) * (1 + (i * 0.02))
                asset_type_performance[asset_type].append({
                    "date": date_str,
                    "value": type_value
                })
            
            # Monthly contributions (placeholder - can be enhanced)
            monthly_contributions.append({
                "date": date_str,
                "value": metrics["costBasis"] / 12  # Evenly distributed
            })
        
        # Convert asset type performance to list format
        asset_type_perf_list = [
            {
                "assetType": asset_type,
                "data": data
            }
            for asset_type, data in asset_type_performance.items()
        ]
        
        # Portfolio vs SPY - use actual investment dates
        spy_comparison = await calculate_spy_comparison_with_dates(metrics["holdings"])
        portfolio_vs_spy = spy_comparison.get("timeSeries", [])
        
        # If no time series data, create a simple one
        if not portfolio_vs_spy:
            spy_data = await get_spy_data()
            for i in range(12):
                date = now - timedelta(days=30 * (11 - i))
                date_str = date.strftime("%Y-%m-%d")
                portfolio_vs_spy.append({
                    "date": date_str,
                    "portfolio": metrics["currentValue"] * (1 + (i * 0.02)),
                    "spy": spy_data["spyValue"] * (1 + (i * 0.015))
                })
        
        return PortfolioPerformance(
            portfolioPerformance=portfolio_performance,
            assetTypePerformance=asset_type_perf_list,
            monthlyContributions=monthly_contributions,
            portfolioVsSpy=portfolio_vs_spy
        )
    except Exception as e:
        logger.error(f"Error getting portfolio performance: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get performance: {str(e)}")

@portfolio_router.get("/allocation")
async def get_portfolio_allocation(
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Get allocation data (asset types, sectors)"""
    try:
        metrics = await calculate_portfolio_metrics(current_user.id)
        
        # Asset type allocation
        asset_type_allocation = []
        asset_type_totals = {}
        
        for holding in metrics["holdings"]:
            asset_type = holding.get("type", "stock")
            value = holding.get("total_value", 0)
            if asset_type not in asset_type_totals:
                asset_type_totals[asset_type] = 0
            asset_type_totals[asset_type] += value
        
        total_portfolio_value = metrics["currentValue"]
        for asset_type, value in asset_type_totals.items():
            percentage = (value / total_portfolio_value * 100) if total_portfolio_value > 0 else 0
            asset_type_allocation.append({
                "assetType": asset_type,
                "value": value,
                "percentage": percentage
            })
        
        # Sector allocation
        sector_allocation = []
        sector_totals = {}
        
        for holding in metrics["holdings"]:
            sector = holding.get("sector", "Unknown")
            value = holding.get("total_value", 0)
            if sector not in sector_totals:
                sector_totals[sector] = 0
            sector_totals[sector] += value
        
        for sector, value in sector_totals.items():
            percentage = (value / total_portfolio_value * 100) if total_portfolio_value > 0 else 0
            sector_allocation.append({
                "sector": sector,
                "value": value,
                "percentage": percentage
            })
        
        # Allocation summary
        by_asset_type = ", ".join([
            f"{at['assetType']} ({at['percentage']:.1f}%)"
            for at in asset_type_allocation
        ]) if asset_type_allocation else "No holdings"
        
        # Risk profile (simplified)
        risk_profile = {
            "highRisk": sum(at["percentage"] for at in asset_type_allocation if at["assetType"] == "crypto"),
            "mediumRisk": sum(at["percentage"] for at in asset_type_allocation if at["assetType"] == "stock"),
            "lowRisk": sum(at["percentage"] for at in asset_type_allocation if at["assetType"] in ["roth_ira", "etf"])
        }
        
        # Largest holding
        largest_holding = None
        if metrics["holdings"]:
            largest = max(metrics["holdings"], key=lambda h: h.get("total_value", 0))
            largest_pct = (largest.get("total_value", 0) / total_portfolio_value * 100) if total_portfolio_value > 0 else 0
            largest_holding = {
                "name": largest.get("name", ""),
                "percentage": largest_pct
            }
        
        allocation_summary = {
            "byAssetType": by_asset_type,
            "riskProfile": risk_profile,
            "diversification": {
                "totalAssets": metrics["totalHoldings"],
                "sectors": len(sector_totals),
                "largestHolding": largest_holding
            }
        }
        
        return AllocationData(
            assetTypeAllocation=asset_type_allocation,
            sectorAllocation=sector_allocation,
            allocationSummary=allocation_summary
        )
    except Exception as e:
        logger.error(f"Error getting portfolio allocation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get allocation: {str(e)}")

@portfolio_router.get("/spy-comparison")
async def get_spy_comparison(
    asset_types: Optional[str] = None,
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Get SPY comparison data based on actual investment dates, optionally filtered by asset types"""
    try:
        metrics = await calculate_portfolio_metrics(current_user.id)
        holdings = metrics.get("holdings", [])
        
        # Filter holdings by selected asset types if provided
        if asset_types:
            selected_types = [t.strip().lower() for t in asset_types.split(',')]
            # Normalize type names
            normalized_selected = set()
            for t in selected_types:
                normalized = t.replace(' ', '_')
                if t == 'cryptocurrency':
                    normalized = 'crypto'
                elif t == 'stocks':
                    normalized = 'stock'
                elif t == 'roth ira':
                    normalized = 'roth_ira'
                normalized_selected.add(normalized)
                normalized_selected.add(t)  # Also keep original
            
            holdings = [
                h for h in holdings
                if (h.get('type', '').lower() in normalized_selected or 
                    h.get('type', '').lower().replace(' ', '_') in normalized_selected)
            ]
        
        if not holdings:
            return SPYComparison(
                spyValue=0.0,
                spyReturnPct=0.0,
                outperformancePct=0.0,
                outperformanceValue=0.0,
                portfolioValue=0.0,
                portfolioReturnPct=0.0,
                spyInvested=0.0,
                portfolioInvested=0.0,
                timeSeries=[]
            )
        
        # Recalculate portfolio metrics for filtered holdings only FIRST
        # This ensures we have accurate cost basis and current values
        filtered_total_cost = sum(float(h.get('total_cost', 0)) for h in holdings)
        filtered_total_value = sum(float(h.get('total_value', 0)) for h in holdings)
        filtered_gain_loss = filtered_total_value - filtered_total_cost
        filtered_return_pct = (filtered_gain_loss / filtered_total_cost * 100) if filtered_total_cost > 0 else 0.0
        
        # Calculate SPY comparison based on actual investment dates for filtered holdings
        # This uses the cost basis (total_cost) from filtered holdings to calculate what SPY would be worth
        spy_comparison = await calculate_spy_comparison_with_dates(holdings)
        
        portfolio_value = filtered_total_value
        portfolio_return = filtered_return_pct
        portfolio_invested = filtered_total_cost
        
        spy_value = spy_comparison["spyValue"]
        spy_return_pct = spy_comparison["spyReturnPct"]
        spy_invested = spy_comparison["spyInvested"]
        
        # Log for debugging
        logger.info(f"SPY Comparison - Portfolio: ${portfolio_value:.2f} (invested: ${portfolio_invested:.2f}), SPY: ${spy_value:.2f} (invested: ${spy_invested:.2f})")
        
        # Calculate outperformance
        outperformance_pct = portfolio_return - spy_return_pct
        outperformance_value = portfolio_value - spy_value
        
        return SPYComparison(
            spyValue=spy_value,
            spyReturnPct=spy_return_pct,
            outperformancePct=outperformance_pct,
            outperformanceValue=outperformance_value,
            portfolioValue=portfolio_value,
            portfolioReturnPct=portfolio_return,
            spyInvested=spy_invested,
            portfolioInvested=portfolio_invested,
            timeSeries=spy_comparison.get("timeSeries", [])
        )
    except Exception as e:
        logger.error(f"Error getting SPY comparison: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get SPY comparison: {str(e)}")

@portfolio_router.get("/top-performers")
async def get_top_performers(
    limit: int = 5,
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Get top performing holdings"""
    try:
        metrics = await calculate_portfolio_metrics(current_user.id)
        
        # Sort by return percentage
        sorted_holdings = sorted(
            metrics["holdings"],
            key=lambda h: h.get("gain_loss_percent", 0),
            reverse=True
        )
        
        top_performers = sorted_holdings[:limit]
        
        return [
            {
                "symbol": h.get("symbol"),
                "name": h.get("name"),
                "returnPct": h.get("gain_loss_percent", 0),
                "value": h.get("total_value", 0),
                "gainLoss": h.get("gain_loss", 0)
            }
            for h in top_performers
        ]
    except Exception as e:
        logger.error(f"Error getting top performers: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get top performers: {str(e)}")

# Benchmark comparison functions and endpoint
def calculate_cagr(start_value: float, end_value: float, years: float) -> float:
    """Calculate Compound Annual Growth Rate"""
    if start_value <= 0 or years <= 0:
        return 0.0
    return ((end_value / start_value) ** (1 / years) - 1) * 100

def calculate_max_drawdown(series: List[float]) -> float:
    """Calculate maximum drawdown percentage"""
    if not series:
        return 0.0
    
    peak = series[0]
    max_dd = 0.0
    
    for value in series:
        if value > peak:
            peak = value
        drawdown = ((peak - value) / peak) * 100
        if drawdown > max_dd:
            max_dd = drawdown
    
    return max_dd

def normalize_series(series: List[Dict], start_value: float = None) -> List[Dict]:
    """Normalize series to start at 100"""
    if not series:
        return []
    
    if start_value is None:
        start_value = series[0].get('value', series[0].get('price', 100))
    
    if start_value == 0:
        start_value = 100
    
    normalized = []
    for point in series:
        value = point.get('value', point.get('price', 0))
        normalized_value = (value / start_value) * 100
        normalized.append({
            "date": point.get('date', ''),
            "value": round(normalized_value, 2)
        })
    
    return normalized

def align_series_by_date(series1: List[Dict], series2: List[Dict]) -> tuple:
    """Align two series by date, using interpolation if needed"""
    dates1 = {point.get('date'): point for point in series1}
    dates2 = {point.get('date'): point for point in series2}
    all_dates = sorted(set(list(dates1.keys()) + list(dates2.keys())))
    
    aligned1 = []
    aligned2 = []
    
    for date in all_dates:
        point1 = dates1.get(date)
        point2 = dates2.get(date)
        
        if not point1 and aligned1:
            point1 = aligned1[-1]
        if not point2 and aligned2:
            point2 = aligned2[-1]
        
        if point1 and point2:
            aligned1.append({
                "date": date,
                "value": point1.get('value', point1.get('price', 0))
            })
            aligned2.append({
                "date": date,
                "value": point2.get('value', point2.get('price', 0))
            })
    
    return aligned1, aligned2

async def get_portfolio_series(user_id: str, from_date: str, to_date: str) -> List[Dict]:
    """Get portfolio time series between dates"""
    try:
        metrics = await calculate_portfolio_metrics(user_id)
        holdings = metrics.get("holdings", [])
        
        if not holdings:
            return []
        
        from_dt = datetime.fromisoformat(from_date)
        to_dt = datetime.fromisoformat(to_date)
        current_value = metrics.get("currentValue", 0)
        cost_basis = metrics.get("costBasis", 0)
        
        series = []
        days = (to_dt - from_dt).days
        
        for i in range(0, days + 1, max(1, days // 30)):
            date = from_dt + timedelta(days=i)
            days_elapsed = i
            progress = min(1.0, days_elapsed / days) if days > 0 else 0
            estimated_value = cost_basis + (current_value - cost_basis) * progress
            
            series.append({
                "date": date.strftime("%Y-%m-%d"),
                "value": estimated_value
            })
        
        return series
    except Exception as e:
        logger.error(f"Error getting portfolio series: {str(e)}")
        return []

@portfolio_router.get("/benchmark")
async def get_benchmark_comparison(
    benchmark_id: str,
    from_date: str,
    to_date: str,
    weights: Optional[str] = None,
    adjust_for_inflation: Optional[str] = "false",
    current_user: UserData = Depends(get_current_user_dependency)
):
    """Compare portfolio performance against a benchmark"""
    try:
        portfolio_series = await get_portfolio_series(current_user.id, from_date, to_date)
        
        if not portfolio_series:
            raise HTTPException(status_code=400, detail="No portfolio data available for the selected date range")
        
        benchmark_series = []
        
        if benchmark_id == "CUSTOM":
            if not weights:
                raise HTTPException(status_code=400, detail="Weights required for custom benchmark")
            
            try:
                weight_dict = json.loads(weights)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid weights JSON format")
            
            total_weight = sum(weight_dict.values())
            if abs(total_weight - 1.0) > 0.01:
                raise HTTPException(status_code=400, detail=f"Weights must sum to 100% (got {total_weight*100:.1f}%)")
            
            component_series = {}
            for symbol, weight in weight_dict.items():
                if weight > 0:
                    bench_info = benchmark_service.get_benchmark_info(symbol)
                    if not bench_info:
                        raise HTTPException(status_code=400, detail=f"Unknown benchmark symbol: {symbol}")
                    
                    asset_type = bench_info.get("type", "stock")
                    hist_prices = await benchmark_service.get_historical_prices(
                        symbol, from_date, to_date, asset_type
                    )
                    component_series[symbol] = hist_prices
            
            all_dates = set()
            for series in component_series.values():
                all_dates.update(point.get('date') for point in series)
            
            sorted_dates = sorted(all_dates)
            for date in sorted_dates:
                weighted_value = 0.0
                for symbol, weight in weight_dict.items():
                    if symbol in component_series:
                        series = component_series[symbol]
                        price = 0.0
                        for point in series:
                            if point.get('date') == date:
                                price = point.get('price', 0)
                                break
                        if price == 0 and series:
                            price = series[-1].get('price', 0)
                        weighted_value += price * weight
                
                benchmark_series.append({
                    "date": date,
                    "price": weighted_value
                })
        else:
            bench_info = benchmark_service.get_benchmark_info(benchmark_id)
            if not bench_info:
                raise HTTPException(status_code=400, detail=f"Unknown benchmark: {benchmark_id}")
            
            asset_type = bench_info.get("type", "stock")
            hist_prices = await benchmark_service.get_historical_prices(
                bench_info["symbol"], from_date, to_date, asset_type
            )
            benchmark_series = hist_prices
        
        if not benchmark_series:
            raise HTTPException(status_code=500, detail="Failed to fetch benchmark data")
        
        portfolio_aligned, benchmark_aligned = align_series_by_date(portfolio_series, benchmark_series)
        
        if not portfolio_aligned or not benchmark_aligned:
            raise HTTPException(status_code=400, detail="No overlapping dates between portfolio and benchmark")
        
        portfolio_normalized = normalize_series(portfolio_aligned)
        benchmark_normalized = normalize_series(benchmark_aligned)
        
        portfolio_values = [p['value'] for p in portfolio_normalized]
        benchmark_values = [b['value'] for b in benchmark_normalized]
        
        portfolio_start = portfolio_values[0] if portfolio_values else 100
        portfolio_end = portfolio_values[-1] if portfolio_values else 100
        benchmark_start = benchmark_values[0] if benchmark_values else 100
        benchmark_end = benchmark_values[-1] if benchmark_values else 100
        
        portfolio_return_pct = ((portfolio_end / portfolio_start) - 1) * 100
        benchmark_return_pct = ((benchmark_end / benchmark_start) - 1) * 100
        
        from_dt = datetime.fromisoformat(from_date)
        to_dt = datetime.fromisoformat(to_date)
        years = (to_dt - from_dt).days / 365.25
        
        portfolio_cagr = calculate_cagr(portfolio_start, portfolio_end, years)
        benchmark_cagr = calculate_cagr(benchmark_start, benchmark_end, years)
        portfolio_max_dd = calculate_max_drawdown(portfolio_values)
        benchmark_max_dd = calculate_max_drawdown(benchmark_values)
        
        stats = {
            "portfolioReturnPct": round(portfolio_return_pct, 2),
            "benchmarkReturnPct": round(benchmark_return_pct, 2),
            "portfolioCagrPct": round(portfolio_cagr, 2),
            "benchmarkCagrPct": round(benchmark_cagr, 2),
            "portfolioMaxDrawdownPct": round(portfolio_max_dd, 2),
            "benchmarkMaxDrawdownPct": round(benchmark_max_dd, 2)
        }
        
        real_portfolio = None
        real_benchmark = None
        
        if adjust_for_inflation.lower() == "true":
            inflation_data = await benchmark_service.get_inflation_index(from_date, to_date)
            
            if inflation_data:
                inflation_map = {point['date']: point['index'] for point in inflation_data}
                base_index = inflation_data[0]['index'] if inflation_data else 100.0
                
                real_portfolio = []
                for point in portfolio_normalized:
                    date = point['date']
                    nominal_value = point['value']
                    current_index = inflation_map.get(date, base_index)
                    real_value = nominal_value * (base_index / current_index)
                    real_portfolio.append({
                        "date": date,
                        "value": round(real_value, 2)
                    })
                
                real_benchmark = []
                for point in benchmark_normalized:
                    date = point['date']
                    nominal_value = point['value']
                    current_index = inflation_map.get(date, base_index)
                    real_value = nominal_value * (base_index / current_index)
                    real_benchmark.append({
                        "date": date,
                        "value": round(real_value, 2)
                    })
                
                if real_portfolio and real_benchmark:
                    real_portfolio_values = [p['value'] for p in real_portfolio]
                    real_benchmark_values = [b['value'] for b in real_benchmark]
                    
                    real_portfolio_start = real_portfolio_values[0]
                    real_portfolio_end = real_portfolio_values[-1]
                    real_benchmark_start = real_benchmark_values[0]
                    real_benchmark_end = real_benchmark_values[-1]
                    
                    real_portfolio_return = ((real_portfolio_end / real_portfolio_start) - 1) * 100
                    real_benchmark_return = ((real_benchmark_end / real_benchmark_start) - 1) * 100
                    
                    stats["portfolioRealReturnPct"] = round(real_portfolio_return, 2)
                    stats["benchmarkRealReturnPct"] = round(real_benchmark_return, 2)
        
        return {
            "portfolio": portfolio_normalized,
            "benchmark": benchmark_normalized,
            "realPortfolio": real_portfolio,
            "realBenchmark": real_benchmark,
            "stats": stats
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting benchmark comparison: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get benchmark comparison: {str(e)}")

class ProjectionInput(BaseModel):
    currentPortfolioValue: float
    currentAge: Optional[int] = None
    targetAmount: Optional[float] = None
    targetAge: Optional[int] = None
    monthlyContribution: float
    annualContributionIncreasePct: float
    expectedAnnualReturnPct: float
    annualVolatilityPct: float
    years: int
    effectiveTaxRatePct: float = 0.0

@portfolio_router.post("/projections")
async def calculate_projections(
    input_data: ProjectionInput,
    current_user: UserData = Depends(get_current_user_dependency)
):
    """
    Calculate financial projections with Monte Carlo simulation
    
    Request body: ProjectionInput
    Response: ProjectionResult with deterministic path, Monte Carlo paths, and summary
    """
    try:
        # Validate inputs
        if input_data.monthlyContribution < 0:
            raise HTTPException(status_code=400, detail="Monthly contribution cannot be negative")
        if input_data.annualVolatilityPct < 0:
            raise HTTPException(status_code=400, detail="Volatility cannot be negative")
        if input_data.years < 1:
            raise HTTPException(status_code=400, detail="Projection horizon must be at least 1 year")
        if input_data.effectiveTaxRatePct < 0 or input_data.effectiveTaxRatePct > 60:
            raise HTTPException(status_code=400, detail="Tax rate must be between 0% and 60%")
        if input_data.expectedAnnualReturnPct > 0.5:  # 50% is extremely high
            logger.warning(f"Very high expected return: {input_data.expectedAnnualReturnPct * 100}%")
        
        # Calculate projection
        result = projection_service.calculate_projection(
            current_portfolio_value=input_data.currentPortfolioValue,
            monthly_contribution=input_data.monthlyContribution,
            annual_contribution_increase_pct=input_data.annualContributionIncreasePct,
            expected_annual_return_pct=input_data.expectedAnnualReturnPct,
            annual_volatility_pct=input_data.annualVolatilityPct,
            years=input_data.years,
            current_age=input_data.currentAge,
            target_amount=input_data.targetAmount,
            target_age=input_data.targetAge,
            effective_tax_rate_pct=input_data.effectiveTaxRatePct
        )
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating projections: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to calculate projections: {str(e)}")

