"""
Benchmark data service for fetching historical prices and inflation data
"""
import httpx
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import logging
import os
from pycoingecko import CoinGeckoAPI

logger = logging.getLogger(__name__)

class BenchmarkService:
    def __init__(self):
        self.cg = CoinGeckoAPI()
        self.alpha_vantage_key = os.environ.get('ALPHA_VANTAGE_API_KEY')
        
        # Benchmark definitions
        self.benchmarks = {
            "SPY": {"name": "S&P 500", "symbol": "SPY", "type": "stock"},
            "QQQ": {"name": "NASDAQ-100", "symbol": "QQQ", "type": "stock"},
            "SCHD": {"name": "Schwab US Dividend Equity ETF", "symbol": "SCHD", "type": "stock"},
            "VIG": {"name": "Vanguard Dividend Appreciation ETF", "symbol": "VIG", "type": "stock"},
            "BTC": {"name": "Bitcoin", "symbol": "BTC", "type": "crypto"},
            "ETH": {"name": "Ethereum", "symbol": "ETH", "type": "crypto"},
        }
        
        # Cache for historical data
        self.historical_cache = {}
        self.inflation_cache = {}
    
    async def get_historical_prices(
        self,
        symbol: str,
        from_date: str,
        to_date: str,
        asset_type: str = "stock"
    ) -> List[Dict[str, float]]:
        """
        Fetch historical prices for a symbol between dates
        Returns: [{date: "YYYY-MM-DD", price: float}, ...]
        """
        cache_key = f"{symbol}_{from_date}_{to_date}"
        if cache_key in self.historical_cache:
            return self.historical_cache[cache_key]
        
        try:
            from_dt = datetime.fromisoformat(from_date)
            to_dt = datetime.fromisoformat(to_date)
            
            if asset_type == "crypto":
                prices = await self._get_crypto_historical(symbol, from_dt, to_dt)
            else:
                prices = await self._get_stock_historical(symbol, from_dt, to_dt)
            
            self.historical_cache[cache_key] = prices
            return prices
        except Exception as e:
            logger.error(f"Error fetching historical prices for {symbol}: {str(e)}")
            # Return mock data for now - TODO: integrate real API
            return self._generate_mock_historical(symbol, from_date, to_date)
    
    async def _get_stock_historical(self, symbol: str, from_dt: datetime, to_dt: datetime) -> List[Dict]:
        """Fetch historical stock prices using Yahoo Finance or Alpha Vantage"""
        try:
            # Try Alpha Vantage first if available
            if self.alpha_vantage_key and self.alpha_vantage_key != "your_key_here":
                try:
                    return await self._get_alpha_vantage_historical(symbol, from_dt, to_dt)
                except Exception as e:
                    logger.warning(f"Alpha Vantage failed for {symbol}: {str(e)}")
            
            # Fallback to Yahoo Finance
            return await self._get_yahoo_historical(symbol, from_dt, to_dt)
        except Exception as e:
            logger.error(f"Failed to fetch stock historical for {symbol}: {str(e)}")
            return self._generate_mock_historical(symbol, from_dt.strftime("%Y-%m-%d"), to_dt.strftime("%Y-%m-%d"))
    
    async def _get_yahoo_historical(self, symbol: str, from_dt: datetime, to_dt: datetime) -> List[Dict]:
        """Fetch historical data from Yahoo Finance (unofficial API)"""
        try:
            period1 = int(from_dt.timestamp())
            period2 = int(to_dt.timestamp())
            
            url = f"https://query1.finance.yahoo.com/v7/finance/download/{symbol}"
            params = {
                "period1": period1,
                "period2": period2,
                "interval": "1d",
                "events": "history"
            }
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, params=params, headers={
                    "User-Agent": "Mozilla/5.0"
                })
                
                if response.status_code == 200:
                    lines = response.text.strip().split('\n')
                    if len(lines) < 2:
                        raise Exception("Invalid CSV response")
                    
                    prices = []
                    for line in lines[1:]:  # Skip header
                        parts = line.split(',')
                        if len(parts) >= 5:
                            date_str = parts[0]
                            try:
                                close_price = float(parts[4])
                                prices.append({
                                    "date": date_str,
                                    "price": close_price
                                })
                            except (ValueError, IndexError):
                                continue
                    
                    return prices if prices else self._generate_mock_historical(
                        symbol, from_dt.strftime("%Y-%m-%d"), to_dt.strftime("%Y-%m-%d")
                    )
                else:
                    raise Exception(f"Yahoo Finance returned {response.status_code}")
        except Exception as e:
            logger.warning(f"Yahoo Finance historical failed for {symbol}: {str(e)}")
            return self._generate_mock_historical(
                symbol, from_dt.strftime("%Y-%m-%d"), to_dt.strftime("%Y-%m-%d")
            )
    
    async def _get_alpha_vantage_historical(self, symbol: str, from_dt: datetime, to_dt: datetime) -> List[Dict]:
        """Fetch historical data from Alpha Vantage"""
        # TODO: Implement Alpha Vantage historical data
        # For now, fallback to mock
        return self._generate_mock_historical(
            symbol, from_dt.strftime("%Y-%m-%d"), to_dt.strftime("%Y-%m-%d")
        )
    
    async def _get_crypto_historical(self, symbol: str, from_dt: datetime, to_dt: datetime) -> List[Dict]:
        """Fetch historical crypto prices from CoinGecko"""
        try:
            crypto_id_map = {
                "BTC": "bitcoin",
                "ETH": "ethereum"
            }
            
            crypto_id = crypto_id_map.get(symbol.upper())
            if not crypto_id:
                raise Exception(f"Unknown crypto symbol: {symbol}")
            
            # CoinGecko API
            from_timestamp = int(from_dt.timestamp())
            to_timestamp = int(to_dt.timestamp())
            
            # Use CoinGecko's market chart range endpoint
            url = f"https://api.coingecko.com/api/v3/coins/{crypto_id}/market_chart/range"
            params = {
                "vs_currency": "usd",
                "from": from_timestamp,
                "to": to_timestamp
            }
            
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(url, params=params)
                
                if response.status_code == 200:
                    data = response.json()
                    prices_data = data.get("prices", [])
                    
                    prices = []
                    for timestamp, price in prices_data:
                        date = datetime.fromtimestamp(timestamp / 1000)
                        prices.append({
                            "date": date.strftime("%Y-%m-%d"),
                            "price": float(price)
                        })
                    
                    return prices if prices else self._generate_mock_historical(
                        symbol, from_dt.strftime("%Y-%m-%d"), to_dt.strftime("%Y-%m-%d")
                    )
                else:
                    raise Exception(f"CoinGecko returned {response.status_code}")
        except Exception as e:
            logger.warning(f"CoinGecko historical failed for {symbol}: {str(e)}")
            return self._generate_mock_historical(
                symbol, from_dt.strftime("%Y-%m-%d"), to_dt.strftime("%Y-%m-%d")
            )
    
    def _generate_mock_historical(self, symbol: str, from_date: str, to_date: str) -> List[Dict]:
        """Generate mock historical data for development/testing"""
        from_dt = datetime.fromisoformat(from_date)
        to_dt = datetime.fromisoformat(to_date)
        
        # Base prices for different benchmarks
        base_prices = {
            "SPY": 450.0,
            "QQQ": 380.0,
            "SCHD": 75.0,
            "VIG": 160.0,
            "BTC": 45000.0,
            "ETH": 2500.0
        }
        
        base_price = base_prices.get(symbol, 100.0)
        days = (to_dt - from_dt).days
        prices = []
        
        # Generate daily prices with some variation
        import random
        current_price = base_price
        
        for i in range(days + 1):
            date = from_dt + timedelta(days=i)
            # Random walk with slight upward trend
            change = random.uniform(-0.02, 0.03)
            current_price = current_price * (1 + change)
            prices.append({
                "date": date.strftime("%Y-%m-%d"),
                "price": round(current_price, 2)
            })
        
        return prices
    
    async def get_inflation_index(self, from_date: str, to_date: str) -> List[Dict[str, float]]:
        """
        Fetch CPI (Consumer Price Index) data for inflation adjustment
        Returns: [{date: "YYYY-MM-DD", index: float}, ...]
        """
        cache_key = f"inflation_{from_date}_{to_date}"
        if cache_key in self.inflation_cache:
            return self.inflation_cache[cache_key]
        
        try:
            # TODO: Integrate with real CPI data API (e.g., FRED API)
            # For now, generate mock CPI data
            inflation_data = self._generate_mock_cpi(from_date, to_date)
            self.inflation_cache[cache_key] = inflation_data
            return inflation_data
        except Exception as e:
            logger.error(f"Error fetching inflation data: {str(e)}")
            return self._generate_mock_cpi(from_date, to_date)
    
    def _generate_mock_cpi(self, from_date: str, to_date: str) -> List[Dict]:
        """Generate mock CPI data (base index = 100 at start date)"""
        from_dt = datetime.fromisoformat(from_date)
        to_dt = datetime.fromisoformat(to_date)
        
        # Assume ~3% annual inflation
        annual_inflation = 0.03
        days = (to_dt - from_dt).days
        cpi_data = []
        
        base_index = 100.0
        for i in range(0, days + 1, 30):  # Monthly data points
            date = from_dt + timedelta(days=i)
            months_elapsed = i / 30.0
            index = base_index * ((1 + annual_inflation) ** (months_elapsed / 12.0))
            cpi_data.append({
                "date": date.strftime("%Y-%m-%d"),
                "index": round(index, 4)
            })
        
        return cpi_data
    
    def get_benchmark_info(self, benchmark_id: str) -> Optional[Dict]:
        """Get benchmark metadata"""
        if benchmark_id == "CUSTOM":
            return {
                "id": "CUSTOM",
                "name": "Custom Blended Benchmark",
                "description": "User-defined weighted combination of benchmarks"
            }
        return self.benchmarks.get(benchmark_id)

# Global instance
benchmark_service = BenchmarkService()

