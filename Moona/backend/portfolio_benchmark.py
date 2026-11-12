"""
Benchmark comparison endpoint for portfolio.py
This file contains the benchmark comparison logic that will be integrated into portfolio.py
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import List, Optional, Dict
import logging
import json
from auth import get_current_user_dependency, UserData
from portfolio import calculate_portfolio_metrics, portfolio_router
from benchmark_service import benchmark_service

logger = logging.getLogger(__name__)

class BenchmarkSeriesPoint(BaseModel):
    date: str
    value: float

class BenchmarkComparisonResponse(BaseModel):
    portfolio: List[BenchmarkSeriesPoint]
    benchmark: List[BenchmarkSeriesPoint]
    realPortfolio: Optional[List[BenchmarkSeriesPoint]] = None
    realBenchmark: Optional[List[BenchmarkSeriesPoint]] = None
    stats: Dict

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
    # Create date maps
    dates1 = {point.get('date'): point for point in series1}
    dates2 = {point.get('date'): point for point in series2}
    
    # Get all unique dates, sorted
    all_dates = sorted(set(list(dates1.keys()) + list(dates2.keys())))
    
    aligned1 = []
    aligned2 = []
    
    for date in all_dates:
        point1 = dates1.get(date)
        point2 = dates2.get(date)
        
        # If missing, use previous value (forward fill)
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
        
        # Generate portfolio series based on holdings
        from_dt = datetime.fromisoformat(from_date)
        to_dt = datetime.fromisoformat(to_date)
        
        # For simplicity, use current value and estimate historical values
        # In production, you'd track daily portfolio values
        current_value = metrics.get("currentValue", 0)
        cost_basis = metrics.get("costBasis", 0)
        
        series = []
        days = (to_dt - from_dt).days
        
        # Estimate portfolio growth over time
        for i in range(0, days + 1, max(1, days // 30)):  # ~30 data points
            date = from_dt + timedelta(days=i)
            days_elapsed = i
            years_elapsed = days_elapsed / 365.0
            
            # Estimate value: start from cost basis, grow to current value
            if years_elapsed == 0:
                estimated_value = cost_basis
            else:
                # Linear interpolation for simplicity
                progress = min(1.0, days_elapsed / days)
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
    """
    Compare portfolio performance against a benchmark
    
    Query params:
    - benchmark_id: SPY, QQQ, SCHD, VIG, BTC, ETH, or CUSTOM
    - from_date: ISO date string (YYYY-MM-DD)
    - to_date: ISO date string (YYYY-MM-DD)
    - weights: JSON string for custom benchmark (e.g., '{"QQQ":0.5,"SCHD":0.3,"BTC":0.2}')
    - adjust_for_inflation: "true" or "false"
    """
    try:
        # Get portfolio series
        portfolio_series = await get_portfolio_series(current_user.id, from_date, to_date)
        
        if not portfolio_series:
            raise HTTPException(status_code=400, detail="No portfolio data available for the selected date range")
        
        # Get benchmark series
        benchmark_series = []
        
        if benchmark_id == "CUSTOM":
            # Parse weights
            if not weights:
                raise HTTPException(status_code=400, detail="Weights required for custom benchmark")
            
            try:
                weight_dict = json.loads(weights)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid weights JSON format")
            
            # Validate weights sum to ~100%
            total_weight = sum(weight_dict.values())
            if abs(total_weight - 1.0) > 0.01:
                raise HTTPException(status_code=400, detail=f"Weights must sum to 100% (got {total_weight*100:.1f}%)")
            
            # Fetch component series
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
            
            # Combine weighted series
            all_dates = set()
            for series in component_series.values():
                all_dates.update(point.get('date') for point in series)
            
            sorted_dates = sorted(all_dates)
            for date in sorted_dates:
                weighted_value = 0.0
                for symbol, weight in weight_dict.items():
                    if symbol in component_series:
                        # Find price for this date (or closest)
                        series = component_series[symbol]
                        price = 0.0
                        for point in series:
                            if point.get('date') == date:
                                price = point.get('price', 0)
                                break
                        if price == 0 and series:
                            # Use last available price
                            price = series[-1].get('price', 0)
                        weighted_value += price * weight
                
                benchmark_series.append({
                    "date": date,
                    "price": weighted_value
                })
        else:
            # Single benchmark
            bench_info = benchmark_service.get_benchmark_info(benchmark_id)
            if not bench_info:
                raise HTTPException(status_code=400, detail=f"Unknown benchmark: {benchmark_id}")
            
            asset_type = bench_info.get("type", "stock")
            hist_prices = await benchmark_service.get_historical_prices(
                bench_info["symbol"], asset_type, from_date, to_date
            )
            benchmark_series = hist_prices
        
        if not benchmark_series:
            raise HTTPException(status_code=500, detail="Failed to fetch benchmark data")
        
        # Align series by date
        portfolio_aligned, benchmark_aligned = align_series_by_date(portfolio_series, benchmark_series)
        
        if not portfolio_aligned or not benchmark_aligned:
            raise HTTPException(status_code=400, detail="No overlapping dates between portfolio and benchmark")
        
        # Normalize both to 100 at start
        portfolio_normalized = normalize_series(portfolio_aligned)
        benchmark_normalized = normalize_series(benchmark_aligned)
        
        # Calculate stats
        portfolio_values = [p['value'] for p in portfolio_normalized]
        benchmark_values = [b['value'] for b in benchmark_normalized]
        
        portfolio_start = portfolio_values[0] if portfolio_values else 100
        portfolio_end = portfolio_values[-1] if portfolio_values else 100
        benchmark_start = benchmark_values[0] if benchmark_values else 100
        benchmark_end = benchmark_values[-1] if benchmark_values else 100
        
        # Total return %
        portfolio_return_pct = ((portfolio_end / portfolio_start) - 1) * 100
        benchmark_return_pct = ((benchmark_end / benchmark_start) - 1) * 100
        
        # Calculate years
        from_dt = datetime.fromisoformat(from_date)
        to_dt = datetime.fromisoformat(to_date)
        years = (to_dt - from_dt).days / 365.25
        
        # CAGR
        portfolio_cagr = calculate_cagr(portfolio_start, portfolio_end, years)
        benchmark_cagr = calculate_cagr(benchmark_start, benchmark_end, years)
        
        # Max drawdown
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
        
        # Inflation adjustment if requested
        real_portfolio = None
        real_benchmark = None
        
        if adjust_for_inflation.lower() == "true":
            inflation_data = await benchmark_service.get_inflation_index(from_date, to_date)
            
            if inflation_data:
                # Create inflation map
                inflation_map = {point['date']: point['index'] for point in inflation_data}
                base_index = inflation_data[0]['index'] if inflation_data else 100.0
                
                # Adjust portfolio
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
                
                # Adjust benchmark
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
                
                # Calculate real returns
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

