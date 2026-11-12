# Company name mapping for popular stocks and ETFs
COMPANY_NAMES = {
    # Major Tech Stocks
    'AAPL': 'Apple Inc.',
    'MSFT': 'Microsoft Corporation',
    'GOOGL': 'Alphabet Inc. Class A',
    'GOOG': 'Alphabet Inc. Class C',
    'AMZN': 'Amazon.com Inc.',
    'TSLA': 'Tesla Inc.',
    'META': 'Meta Platforms Inc.',
    'NVDA': 'NVIDIA Corporation',
    'NFLX': 'Netflix Inc.',
    'AMD': 'Advanced Micro Devices Inc.',
    'CRM': 'Salesforce Inc.',
    'ORCL': 'Oracle Corporation',
    'ADBE': 'Adobe Inc.',
    'INTC': 'Intel Corporation',
    'IBM': 'International Business Machines',
    'QCOM': 'Qualcomm Inc.',
    'TXN': 'Texas Instruments Inc.',
    'AVGO': 'Broadcom Inc.',
    
    # Financial Services
    'JPM': 'JPMorgan Chase & Co.',
    'BAC': 'Bank of America Corp.',
    'WFC': 'Wells Fargo & Company',
    'GS': 'Goldman Sachs Group Inc.',
    'MS': 'Morgan Stanley',
    'C': 'Citigroup Inc.',
    'AXP': 'American Express Company',
    'V': 'Visa Inc.',
    'MA': 'Mastercard Inc.',
    'PYPL': 'PayPal Holdings Inc.',
    
    # Healthcare & Pharma
    'JNJ': 'Johnson & Johnson',
    'PFE': 'Pfizer Inc.',
    'UNH': 'UnitedHealth Group Inc.',
    'MRNA': 'Moderna Inc.',
    'ABBV': 'AbbVie Inc.',
    'TMO': 'Thermo Fisher Scientific Inc.',
    'ABT': 'Abbott Laboratories',
    'CVS': 'CVS Health Corporation',
    'MRK': 'Merck & Co. Inc.',
    'LLY': 'Eli Lilly and Company',
    
    # Consumer & Retail
    'WMT': 'Walmart Inc.',
    'HD': 'Home Depot Inc.',
    'PG': 'Procter & Gamble Company',
    'KO': 'Coca-Cola Company',
    'PEP': 'PepsiCo Inc.',
    'MCD': "McDonald's Corporation",
    'SBUX': 'Starbucks Corporation',
    'NKE': 'Nike Inc.',
    'DIS': 'Walt Disney Company',
    'COST': 'Costco Wholesale Corporation',
    
    # Energy & Utilities
    'XOM': 'Exxon Mobil Corporation',
    'CVX': 'Chevron Corporation',
    'NEE': 'NextEra Energy Inc.',
    'COP': 'ConocoPhillips',
    'EOG': 'EOG Resources Inc.',
    
    # ETFs & Index Funds
    'SPY': 'SPDR S&P 500 ETF Trust',
    'QQQ': 'Invesco QQQ Trust',
    'IWM': 'iShares Russell 2000 ETF',
    'VTI': 'Vanguard Total Stock Market ETF',
    'VOO': 'Vanguard S&P 500 ETF',
    'VEA': 'Vanguard FTSE Developed Markets ETF',
    'VWO': 'Vanguard FTSE Emerging Markets ETF',
    'VXUS': 'Vanguard Total International Stock ETF',
    'BND': 'Vanguard Total Bond Market ETF',
    'VNQ': 'Vanguard Real Estate Index Fund ETF',
    'GLD': 'SPDR Gold Shares',
    'SLV': 'iShares Silver Trust',
    
    # Other Popular Stocks
    'F': 'Ford Motor Company',
    'GM': 'General Motors Company',
    'BA': 'Boeing Company',
    'CAT': 'Caterpillar Inc.',
    'GE': 'General Electric Company',
    'MMM': '3M Company',
    'KMI': 'Kinder Morgan Inc.',
    'T': 'AT&T Inc.',
    'VZ': 'Verizon Communications Inc.',
}

# Sector mapping for stocks
SECTOR_MAPPING = {
    # Technology
    'AAPL': 'Technology', 'MSFT': 'Technology', 'GOOGL': 'Technology', 'GOOG': 'Technology',
    'AMZN': 'Technology', 'META': 'Technology', 'NVDA': 'Technology', 'NFLX': 'Technology',
    'AMD': 'Technology', 'CRM': 'Technology', 'ORCL': 'Technology', 'ADBE': 'Technology',
    'INTC': 'Technology', 'IBM': 'Technology', 'QCOM': 'Technology', 'TXN': 'Technology',
    'AVGO': 'Technology',
    
    # Financial Services
    'JPM': 'Financial Services', 'BAC': 'Financial Services', 'WFC': 'Financial Services',
    'GS': 'Financial Services', 'MS': 'Financial Services', 'C': 'Financial Services',
    'AXP': 'Financial Services', 'V': 'Financial Services', 'MA': 'Financial Services',
    'PYPL': 'Financial Services',
    
    # Healthcare
    'JNJ': 'Healthcare', 'PFE': 'Healthcare', 'UNH': 'Healthcare', 'MRNA': 'Healthcare',
    'ABBV': 'Healthcare', 'TMO': 'Healthcare', 'ABT': 'Healthcare', 'CVS': 'Healthcare',
    'MRK': 'Healthcare', 'LLY': 'Healthcare',
    
    # Consumer Goods
    'WMT': 'Consumer Goods', 'HD': 'Consumer Goods', 'PG': 'Consumer Goods',
    'KO': 'Consumer Goods', 'PEP': 'Consumer Goods', 'MCD': 'Consumer Goods',
    'SBUX': 'Consumer Goods', 'NKE': 'Consumer Goods', 'DIS': 'Entertainment',
    'COST': 'Consumer Goods',
    
    # Energy
    'XOM': 'Energy', 'CVX': 'Energy', 'NEE': 'Utilities', 'COP': 'Energy', 'EOG': 'Energy',
    
    # ETFs
    'SPY': 'ETF', 'QQQ': 'ETF', 'IWM': 'ETF', 'VTI': 'ETF', 'VOO': 'ETF',
    'VEA': 'ETF', 'VWO': 'ETF', 'VXUS': 'ETF', 'BND': 'ETF', 'VNQ': 'ETF',
    'GLD': 'ETF', 'SLV': 'ETF',
    
    # Automotive
    'TSLA': 'Automotive', 'F': 'Automotive', 'GM': 'Automotive',
    
    # Industrial
    'BA': 'Industrial', 'CAT': 'Industrial', 'GE': 'Industrial', 'MMM': 'Industrial',
    
    # Telecommunications
    'T': 'Telecommunications', 'VZ': 'Telecommunications',
    
    # Energy Infrastructure
    'KMI': 'Energy Infrastructure'
}

def get_company_name(symbol: str) -> str:
    """Get company name for a given symbol"""
    return COMPANY_NAMES.get(symbol.upper(), f"{symbol.upper()} Corporation")

def get_sector(symbol: str) -> str:
    """Get sector for a given symbol"""
    return SECTOR_MAPPING.get(symbol.upper(), "Other")