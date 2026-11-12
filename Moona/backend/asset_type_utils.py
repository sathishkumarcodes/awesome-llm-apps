"""
Utility functions for validating and normalizing asset types
"""
from typing import Optional

# All valid asset types
VALID_ASSET_TYPES = {
    'stock', 'crypto', 'roth_ira', 'cash', 'hysa', 'bank', 
    'home_equity', 'other', 'etf', 'bond', '401k', '529', 
    'child_roth', 'hsa', 'traditional_ira', 'sep_ira'
}

# Mapping for common variations/aliases
ASSET_TYPE_ALIASES = {
    'stocks': 'stock',
    'equity': 'stock',
    'equities': 'stock',
    'cryptocurrency': 'crypto',
    'cryptocurrencies': 'crypto',
    'roth': 'roth_ira',
    'roth ira': 'roth_ira',
    'ira': 'roth_ira',  # Default to roth_ira if just "ira"
    'savings': 'hysa',
    'high yield savings': 'hysa',
    'checking': 'bank',
    'checking account': 'bank',
    'savings account': 'bank',
    'bank account': 'bank',
    'real estate': 'home_equity',
    'property': 'home_equity',
    'home': 'home_ira',
    '401(k)': '401k',
    '401(k) plan': '401k',
    '529 plan': '529',
    'college savings': '529',
    "child's roth": 'child_roth',
    "child's roth ira": 'child_roth',
    'child roth': 'child_roth',
    'health savings account': 'hsa',
    'traditional': 'traditional_ira',
    'traditional ira': 'traditional_ira',
    'sep': 'sep_ira',
    'sep ira': 'sep_ira',
    'simplified employee pension': 'sep_ira',
}

def normalize_asset_type(asset_type: Optional[str]) -> str:
    """
    Normalize an asset type to a valid value.
    
    Args:
        asset_type: The asset type to normalize (can be None, empty, or any string)
        
    Returns:
        A valid asset type string, defaulting to 'other' if invalid
    """
    if not asset_type:
        return 'other'
    
    # Convert to lowercase and strip whitespace
    normalized = str(asset_type).lower().strip()
    
    # Check if it's already a valid type
    if normalized in VALID_ASSET_TYPES:
        return normalized
    
    # Check aliases
    if normalized in ASSET_TYPE_ALIASES:
        return ASSET_TYPE_ALIASES[normalized]
    
    # Try to match partial strings (e.g., "ETF" in name -> "etf")
    for alias, valid_type in ASSET_TYPE_ALIASES.items():
        if alias in normalized or normalized in alias:
            return valid_type
    
    # Check for common patterns
    if 'etf' in normalized:
        return 'etf'
    if 'bond' in normalized:
        return 'bond'
    if '401' in normalized or '401k' in normalized:
        return '401k'
    if '529' in normalized:
        return '529'
    if 'hsa' in normalized:
        return 'hsa'
    if 'sep' in normalized:
        return 'sep_ira'
    if 'traditional' in normalized and 'ira' in normalized:
        return 'traditional_ira'
    if 'child' in normalized and ('roth' in normalized or 'ira' in normalized):
        return 'child_roth'
    if 'roth' in normalized or ('ira' in normalized and 'traditional' not in normalized):
        return 'roth_ira'
    if 'crypto' in normalized or 'bitcoin' in normalized or 'ethereum' in normalized:
        return 'crypto'
    if 'cash' in normalized:
        return 'cash'
    if 'savings' in normalized and 'high' in normalized:
        return 'hysa'
    if 'bank' in normalized or 'checking' in normalized or 'savings account' in normalized:
        return 'bank'
    if 'home' in normalized or 'property' in normalized or 'real estate' in normalized:
        return 'home_equity'
    
    # Default to 'other' if we can't determine
    return 'other'

def validate_asset_type(asset_type: str) -> bool:
    """
    Check if an asset type is valid.
    
    Args:
        asset_type: The asset type to validate
        
    Returns:
        True if valid, False otherwise
    """
    return normalize_asset_type(asset_type) in VALID_ASSET_TYPES


