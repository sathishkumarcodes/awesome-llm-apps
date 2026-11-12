import httpx
import asyncio
from pycoingecko import CoinGeckoAPI
from datetime import datetime, timedelta
import logging
from typing import Dict, Optional
import os
from company_data import get_company_name, get_sector

logger = logging.getLogger(__name__)

class PriceService:
    def __init__(self):
        self.cg = CoinGeckoAPI()
        
        # Simple in-memory cache with 5-minute expiry
        self.price_cache = {}
        self.cache_duration = timedelta(minutes=5)
        
        # Alpha Vantage API key (optional, fallback to free APIs if not available)
        self.alpha_vantage_key = os.environ.get('ALPHA_VANTAGE_API_KEY')
        
        # Symbol mappings
        self.crypto_symbol_map = {
            'BTC': 'bitcoin',
            'ETH': 'ethereum', 
            'SOL': 'solana',
            'ADA': 'cardano',
            'DOT': 'polkadot',
            'MATIC': 'polygon',
            'LINK': 'chainlink',
            'UNI': 'uniswap'
        }
    
    def _is_cache_valid(self, symbol: str) -> bool:
        """Check if cached price is still valid"""
        if symbol not in self.price_cache:
            return False
        
        cache_time = self.price_cache[symbol].get('timestamp')
        if not cache_time:
            return False
            
        return datetime.now() - cache_time < self.cache_duration
    
    def _get_cached_price(self, symbol: str) -> Optional[Dict]:
        """Get cached price if valid"""
        if self._is_cache_valid(symbol):
            cached_data = self.price_cache[symbol].copy()
            cached_data.pop('timestamp', None)  # Remove timestamp from response
            return cached_data
        return None
    
    def _cache_price(self, symbol: str, data: Dict):
        """Cache price data"""
        if 'error' not in data:  # Only cache successful responses
            cache_data = data.copy()
            cache_data['timestamp'] = datetime.now()
            self.price_cache[symbol] = cache_data
    
    async def get_stock_price(self, symbol: str) -> Dict:
        """Get current stock price using free APIs with caching"""
        try:
            # Check cache first
            cached_data = self._get_cached_price(symbol)
            if cached_data:
                logger.info(f"Using cached price for {symbol}")
                return cached_data
            
            # Use Alpha Vantage if API key is available
            if self.alpha_vantage_key and self.alpha_vantage_key != "your_key_here":
                try:
                    result = await self._get_alpha_vantage_price(symbol)
                    # Cache the result
                    self._cache_price(symbol, result)
                    return result
                except Exception as e:
                    logger.warning(f"Alpha Vantage failed for {symbol}, trying Yahoo Finance: {str(e)}")
            
            # Fallback to Yahoo Finance API (unofficial but free)
            try:
                result = await self._get_yahoo_finance_price(symbol)
                # Cache the result
                self._cache_price(symbol, result)
                return result
            except Exception as e:
                logger.error(f"Yahoo Finance failed for {symbol}: {str(e)}")
                # Don't use mock data - raise error so caller can handle it
                raise Exception(f"Could not fetch price for {symbol} from any source")
            
        except Exception as e:
            logger.error(f"Error fetching stock price for {symbol}: {str(e)}")
            # Return error instead of mock data
            return {
                "error": f"Could not fetch price for {symbol}",
                "symbol": symbol,
                "message": str(e)
            }
    
    async def _get_yahoo_finance_price(self, symbol: str) -> Dict:
        """Get stock price from Yahoo Finance (free, no API key required)"""
        # Try multiple Yahoo Finance endpoints with retries
        endpoints = [
            f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
            f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}",
        ]
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
        }
        
        for attempt in range(2):  # Try twice with different endpoints
            for endpoint in endpoints:
                try:
                    async with httpx.AsyncClient() as client:
                        # Add delay between requests to avoid rate limiting
                        if attempt > 0:
                            await asyncio.sleep(1)
                        
                        response = await client.get(
                            endpoint, 
                            headers=headers,
                            timeout=15,
                            follow_redirects=True
                        )
                        
                        # Handle rate limiting with retry
                        if response.status_code == 429:
                            logger.warning(f"Rate limited for {symbol}, waiting before retry...")
                            await asyncio.sleep(2)
                            continue
                        
                        response.raise_for_status()
                        
                        data = response.json()
                        
                        # Check if we got valid data
                        if 'chart' not in data or 'result' not in data['chart'] or len(data['chart']['result']) == 0:
                            logger.warning(f"Invalid response structure for {symbol}")
                            continue
                        
                        result = data['chart']['result'][0]
                        meta = result.get('meta', {})
                        
                        # Get current price (try multiple fields)
                        current_price = (
                            meta.get('regularMarketPrice') or 
                            meta.get('currentPrice') or 
                            meta.get('previousClose')
                        )
                        
                        if not current_price:
                            logger.warning(f"No price found in response for {symbol}")
                            continue
                        
                        prev_close = meta.get('previousClose', current_price)
                        change = current_price - prev_close
                        change_percent = (change / prev_close) * 100 if prev_close > 0 else 0
                        
                        return {
                            "symbol": symbol,
                            "name": get_company_name(symbol),
                            "sector": get_sector(symbol),
                            "price": float(current_price),
                            "change": float(change),
                            "change_percent": float(change_percent),
                            "currency": meta.get('currency', 'USD'),
                            "last_updated": datetime.now().isoformat(),
                            "source": "yahoo_finance"
                        }
                        
                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 429:
                        logger.warning(f"Rate limited for {symbol} on attempt {attempt + 1}")
                        await asyncio.sleep(3)  # Wait longer for rate limit
                        continue
                    logger.error(f"HTTP error for {symbol}: {e.response.status_code}")
                except Exception as e:
                    logger.error(f"Yahoo Finance API error for {symbol} on {endpoint}: {str(e)}")
                    continue
        
        # If all attempts failed, raise an error instead of using mock data
        logger.error(f"All Yahoo Finance attempts failed for {symbol}")
        raise Exception(f"Could not fetch price for {symbol} from Yahoo Finance")
    
    def _get_mock_price(self, symbol: str) -> Dict:
        """Fallback mock prices for demonstration when APIs are rate limited"""
        mock_prices = {
            'AAPL': {'price': 182.52, 'change': 2.15, 'change_percent': 1.19},
            'GOOGL': {'price': 142.38, 'change': -1.25, 'change_percent': -0.87},
            'TSLA': {'price': 208.80, 'change': 8.90, 'change_percent': 4.45},
            'MSFT': {'price': 378.85, 'change': 3.22, 'change_percent': 0.86},
            'NVDA': {'price': 875.30, 'change': 15.75, 'change_percent': 1.83},
            'AMZN': {'price': 145.67, 'change': -0.89, 'change_percent': -0.61},
            'META': {'price': 485.23, 'change': 7.44, 'change_percent': 1.56},
            'AMD': {'price': 162.45, 'change': 4.12, 'change_percent': 2.61},
            'VTI': {'price': 245.80, 'change': 1.45, 'change_percent': 0.59},
            'SPY': {'price': 442.15, 'change': 2.33, 'change_percent': 0.53},
            'QQQ': {'price': 368.90, 'change': 5.67, 'change_percent': 1.56}
        }
        
        if symbol.upper() in mock_prices:
            mock_data = mock_prices[symbol.upper()]
            return {
                "symbol": symbol.upper(),
                "name": get_company_name(symbol),
                "sector": get_sector(symbol),
                "price": mock_data['price'],
                "change": mock_data['change'],
                "change_percent": mock_data['change_percent'],
                "currency": "USD",
                "last_updated": datetime.now().isoformat(),
                "source": "mock_fallback"
            }
        else:
            # Generate a reasonable mock price for unknown symbols
            import random
            price = random.uniform(10, 500)
            change = random.uniform(-5, 5)
            change_percent = (change / price) * 100
            
            return {
                "symbol": symbol.upper(),
                "name": get_company_name(symbol),
                "sector": get_sector(symbol),
                "price": round(price, 2),
                "change": round(change, 2),
                "change_percent": round(change_percent, 2),
                "currency": "USD",
                "last_updated": datetime.now().isoformat(),
                "source": "mock_fallback"
            }
    
    async def _get_alpha_vantage_price(self, symbol: str) -> Dict:
        """Get stock price from Alpha Vantage (requires API key)"""
        try:
            async with httpx.AsyncClient() as client:
                url = "https://www.alphavantage.co/query"
                params = {
                    'function': 'GLOBAL_QUOTE',
                    'symbol': symbol,
                    'apikey': self.alpha_vantage_key
                }
                
                response = await client.get(url, params=params, timeout=10)
                response.raise_for_status()
                
                data = response.json()
                
                if 'Global Quote' not in data:
                    raise ValueError(f"Invalid response from Alpha Vantage for {symbol}")
                
                quote = data['Global Quote']
                current_price = float(quote['05. price'])
                change = float(quote['09. change'])
                change_percent = float(quote['10. change percent'].rstrip('%'))
                
                return {
                    "symbol": symbol,
                    "price": current_price,
                    "change": change,
                    "change_percent": change_percent,
                    "currency": "USD",
                    "last_updated": quote['07. latest trading day'],
                    "source": "alpha_vantage"
                }
                
        except Exception as e:
            logger.error(f"Alpha Vantage API error for {symbol}: {str(e)}")
            raise e
    
    async def get_crypto_price(self, symbol: str) -> Dict:
        """Get crypto price from CoinGecko (free, no API key required) with caching"""
        try:
            # Check cache first
            cached_data = self._get_cached_price(symbol)
            if cached_data:
                logger.info(f"Using cached crypto price for {symbol}")
                return cached_data
            
            # Map symbol to CoinGecko ID
            coin_id = self.crypto_symbol_map.get(symbol.upper())
            if not coin_id:
                result = self._get_mock_crypto_price(symbol)
                self._cache_price(symbol, result)
                return result
            
            # Get current price data with timeout
            await asyncio.sleep(0.1)  # Rate limiting for CoinGecko
            price_data = self.cg.get_price(
                ids=coin_id, 
                vs_currencies='usd', 
                include_24hr_change=True,
                include_24hr_vol=True
            )
            
            if coin_id not in price_data:
                result = self._get_mock_crypto_price(symbol)
                self._cache_price(symbol, result)
                return result
            
            coin_data = price_data[coin_id]
            current_price = coin_data['usd']
            change_24h = coin_data.get('usd_24h_change', 0)
            volume_24h = coin_data.get('usd_24h_vol', 0)
            
            # Get crypto name - use CoinGecko name or fallback to company_data
            crypto_name = None
            try:
                # Try to get full name from CoinGecko
                coin_info = self.cg.get_coin_by_id(coin_id)
                if coin_info and 'name' in coin_info:
                    crypto_name = coin_info['name']
            except Exception as e:
                logger.debug(f"Could not get CoinGecko name for {symbol}: {str(e)}")
            
            # Fallback to mapped names if CoinGecko name not available
            if not crypto_name:
                crypto_name_map = {
                    'BTC': 'Bitcoin',
                    'ETH': 'Ethereum',
                    'SOL': 'Solana',
                    'ADA': 'Cardano',
                    'DOT': 'Polkadot',
                    'MATIC': 'Polygon',
                    'LINK': 'Chainlink',
                    'UNI': 'Uniswap'
                }
                crypto_name = crypto_name_map.get(symbol.upper(), get_company_name(symbol))
            
            result = {
                "symbol": symbol.upper(),
                "name": crypto_name,  # Full crypto name
                "sector": "Cryptocurrency",
                "price": current_price,
                "change_24h": change_24h,
                "change_percent": change_24h,  # CoinGecko returns percentage directly
                "volume_24h": volume_24h,
                "currency": "USD",
                "last_updated": datetime.now().isoformat(),
                "source": "coingecko"
            }
            # Cache the result
            self._cache_price(symbol, result)
            return result
            
        except Exception as e:
            logger.error(f"CoinGecko API error for {symbol}: {str(e)}")
            result = self._get_mock_crypto_price(symbol)
            self._cache_price(symbol, result)
            return result
    
    def _get_mock_crypto_price(self, symbol: str) -> Dict:
        """Fallback mock crypto prices for demonstration"""
        mock_crypto_prices = {
            'BTC': {'price': 67500.00, 'change_percent': 2.45},
            'ETH': {'price': 3650.00, 'change_percent': 1.87},
            'SOL': {'price': 142.30, 'change_percent': 3.21},
            'ADA': {'price': 0.38, 'change_percent': -1.23},
            'DOT': {'price': 6.85, 'change_percent': 0.95},
            'MATIC': {'price': 0.72, 'change_percent': 2.15},
            'LINK': {'price': 11.45, 'change_percent': 1.67},
            'UNI': {'price': 8.23, 'change_percent': -0.88}
        }
        
        if symbol.upper() in mock_crypto_prices:
            mock_data = mock_crypto_prices[symbol.upper()]
            return {
                "symbol": symbol.upper(),
                "name": f"{symbol.upper()}",  # Crypto doesn't need company names
                "sector": "Cryptocurrency",
                "price": mock_data['price'],
                "change_24h": mock_data['change_percent'],
                "change_percent": mock_data['change_percent'],
                "volume_24h": 1000000,  # Mock volume
                "currency": "USD",
                "last_updated": datetime.now().isoformat(),
                "source": "mock_fallback"
            }
        else:
            return {"error": f"Unsupported crypto symbol: {symbol}"}
    
    async def get_price(self, symbol: str, asset_type: str = None) -> Dict:
        """Get price for any symbol (auto-detect or specify type)"""
        try:
            # If type is specified, use it
            if asset_type == 'crypto':
                return await self.get_crypto_price(symbol)
            elif asset_type == 'stock':
                return await self.get_stock_price(symbol)
            
            # Auto-detect based on symbol
            if symbol.upper() in self.crypto_symbol_map:
                return await self.get_crypto_price(symbol)
            else:
                return await self.get_stock_price(symbol)
                
        except Exception as e:
            logger.error(f"Error getting price for {symbol}: {str(e)}")
            return {"error": f"Could not fetch price for {symbol}"}
    
    async def get_multiple_prices(self, symbols: list, asset_types: dict = None) -> Dict:
        """Get prices for multiple symbols efficiently with rate limiting"""
        price_data = {}
        
        # Check cache first for all symbols - return cached if available
        cached_count = 0
        for symbol in symbols:
            cached_data = self._get_cached_price(symbol)
            if cached_data:
                price_data[symbol] = cached_data
                cached_count += 1
        
        # If all prices are cached, return immediately
        if cached_count == len(symbols):
            logger.info(f"All {len(symbols)} prices served from cache")
            return price_data
        
        # Process remaining symbols in larger batches for better performance
        remaining_symbols = [s for s in symbols if s not in price_data]
        batch_size = 10  # Increased from 3 to 10 for faster processing
        for i in range(0, len(remaining_symbols), batch_size):
            batch = remaining_symbols[i:i + batch_size]
            
            # Create tasks for concurrent processing
            tasks = []
            for symbol in batch:
                asset_type = asset_types.get(symbol) if asset_types else None
                tasks.append(self.get_price(symbol, asset_type))
            
            # Execute batch concurrently with shorter timeout
            try:
                results = await asyncio.wait_for(
                    asyncio.gather(*tasks, return_exceptions=True), 
                    timeout=3.0  # Reduced from 15 to 3 seconds per batch
                )
                
                for symbol, result in zip(batch, results):
                    if isinstance(result, Exception):
                        logger.error(f"Error getting price for {symbol}: {str(result)}")
                        # Use cached data or mock fallback
                        cached_data = self._get_cached_price(symbol)
                        if cached_data:
                            price_data[symbol] = cached_data
                        else:
                            price_data[symbol] = self._get_mock_price(symbol)
                    else:
                        price_data[symbol] = result
                        
            except asyncio.TimeoutError:
                logger.warning(f"Timeout getting prices for batch: {batch}")
                # Fallback to cached or mock data for timeout batch
                for symbol in batch:
                    cached_data = self._get_cached_price(symbol)
                    if cached_data:
                        price_data[symbol] = cached_data
                    else:
                        price_data[symbol] = self._get_mock_price(symbol)
            
            # Rate limiting between batches
            if i + batch_size < len(symbols):
                await asyncio.sleep(0.5)  # 500ms between batches
        
        return price_data

# Global instance
price_service = PriceService()