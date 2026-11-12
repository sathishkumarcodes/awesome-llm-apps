import React, { useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent } from './ui/card';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Plus, Search, TrendingUp, DollarSign, Loader2, Home, Wallet, Building2 } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Type definitions
const ASSET_CATEGORIES = {
  STOCK: 'stock',
  CRYPTO: 'crypto',
  CASH: 'cash',
  HYSA: 'hysa',
  BANK: 'bank',
  HOME_EQUITY: 'home_equity',
  OTHER: 'other'
};

const ASSET_CATEGORY_LABELS = {
  [ASSET_CATEGORIES.STOCK]: 'Stocks',
  [ASSET_CATEGORIES.CRYPTO]: 'Crypto',
  [ASSET_CATEGORIES.CASH]: 'Cash',
  [ASSET_CATEGORIES.HYSA]: 'HYSA',
  [ASSET_CATEGORIES.BANK]: 'Bank Account',
  [ASSET_CATEGORIES.HOME_EQUITY]: 'Home Equity',
  [ASSET_CATEGORIES.OTHER]: 'Other'
};

const AddHoldingModal = ({ onHoldingAdded }) => {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [errors, setErrors] = useState({});
  
  // Form state
  const [assetCategory, setAssetCategory] = useState('');
  const [formData, setFormData] = useState({
    // Stocks/Crypto
    symbol: '',
    name: '',
    shares: '',
    avg_cost: '',
    sector: '',
    platform: '',
    // Cash/HYSA/Bank
    institutionName: '',
    accountNickname: '',
    accountType: '',
    currentBalance: '',
    interestRate: '',
    // Home Equity
    propertyName: '',
    propertyLocation: '',
    estimatedValue: '',
    mortgageBalance: '',
    ownershipPct: '100',
    // Other
    description: '',
    currentValue: ''
  });
  
  const { toast } = useToast();

  // Helper functions
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const parseNumberSafe = (value) => {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  };

  const computeHomeEquity = () => {
    const estimatedValue = parseNumberSafe(formData.estimatedValue);
    const mortgageBalance = parseNumberSafe(formData.mortgageBalance);
    const ownershipPct = parseNumberSafe(formData.ownershipPct);
    return estimatedValue * (ownershipPct / 100) - mortgageBalance;
  };

  // Debounce utility
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Debounced search function - increased delay to avoid conflicts with typing
  const debounceSearch = useCallback(
    debounce((symbol) => {
      if (symbol.length >= 2) {
        searchSymbolInternal(symbol);
      }
    }, 500), // Increased to 500ms to reduce conflicts with user typing
    [assetCategory] // Include assetCategory in dependencies
  );

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
    
    // Auto-search as user types symbol (stocks/crypto only)
    if (field === 'symbol' && value && (assetCategory === ASSET_CATEGORIES.STOCK || assetCategory === ASSET_CATEGORIES.CRYPTO)) {
      debounceSearch(value.toUpperCase());
    }
  };

  const handleCategoryChange = (category, preserveSymbol = false) => {
    setAssetCategory(category);
    setCurrentPrice(null);
    setErrors({});
    
    // If preserving symbol (for auto-detection), only reset non-symbol fields
    if (preserveSymbol) {
      const currentSymbol = formData.symbol;
      const currentName = formData.name;
      setFormData(prev => ({
        symbol: currentSymbol, // Preserve symbol
        name: currentName || prev.name, // Preserve name if it exists
        shares: prev.shares || '',
        avg_cost: prev.avg_cost || '',
        sector: prev.sector || '',
        platform: prev.platform || '',
        institutionName: '',
        accountNickname: '',
        accountType: '',
        currentBalance: '',
        interestRate: '',
        propertyName: '',
        propertyLocation: '',
        estimatedValue: '',
        mortgageBalance: '',
        ownershipPct: '100',
        description: '',
        currentValue: ''
      }));
    } else {
      // Reset form data when category changes manually
      setFormData({
        symbol: '',
        name: '',
        shares: '',
        avg_cost: '',
        sector: '',
        platform: '',
        institutionName: '',
        accountNickname: '',
        accountType: '',
        currentBalance: '',
        interestRate: '',
        propertyName: '',
        propertyLocation: '',
        estimatedValue: '',
        mortgageBalance: '',
        ownershipPct: '100',
        description: '',
        currentValue: ''
      });
    }
  };

  const searchSymbolInternal = async (symbol) => {
    if (!symbol.trim()) return;

    setIsSearching(true);
    setCurrentPrice(null);

    try {
      const response = await axios.get(`${API}/holdings/search/${symbol}`, {
        withCredentials: true,
        timeout: 8000
      });

      const data = response.data;
      setCurrentPrice(data);
      
      // Update form data atomically - CRITICAL: Always preserve the symbol user is typing
      setFormData(prev => {
        const updates = { ...prev };
        
        // Auto-populate name if we got one from the API
        // Always populate name when available from search (user can edit if needed)
        if (data.name && data.name.trim()) {
          // Always update name if:
          // 1. Name field is empty
          // 2. Name matches the symbol (user hasn't entered a real name yet)
          // 3. Name is the same as symbol (placeholder)
          const currentName = prev.name || '';
          const currentSymbol = prev.symbol || '';
          const shouldUpdateName = !currentName.trim() || 
                                   currentName.trim().toUpperCase() === currentSymbol.toUpperCase() ||
                                   currentName.trim() === currentSymbol.trim();
          
          if (shouldUpdateName) {
            updates.name = data.name.trim();
            console.log(`✅ Auto-populated name: "${data.name.trim()}" for symbol: ${currentSymbol}`);
          } else {
            console.log(`ℹ️ Name not updated - user may have manually entered: "${currentName}"`);
          }
        } else {
          console.log(`⚠️ No name in API response for symbol: ${currentSymbol || symbol}`);
        }
        
        // Auto-populate sector if available and not already set
        if (data.sector && data.sector.trim() && !prev.sector) {
          updates.sector = data.sector.trim();
          console.log(`✅ Auto-populated sector: "${data.sector.trim()}"`);
        }
        
        // Auto-populate average cost with current price if available and avg_cost is empty
        if (data.current_price && data.current_price > 0 && (!prev.avg_cost || prev.avg_cost === '')) {
          updates.avg_cost = parseFloat(data.current_price).toFixed(2);
          console.log(`✅ Auto-populated avg_cost: ${updates.avg_cost}`);
        }
        
        // CRITICAL: Never overwrite the symbol - preserve what user typed
        // The symbol field should remain exactly as the user entered it
        // Don't update it here - let the user's input control it
        
        return updates;
      });
      
      // Auto-detect asset type (preserve symbol when auto-detecting)
      // Only change category if it's currently empty or wrong
      if (data.symbol && ['BTC', 'ETH', 'SOL', 'ADA'].includes(data.symbol)) {
        if (!assetCategory || assetCategory !== ASSET_CATEGORIES.CRYPTO) {
          handleCategoryChange(ASSET_CATEGORIES.CRYPTO, true); // Preserve symbol
        }
      } else if (data.current_price && (!assetCategory || assetCategory !== ASSET_CATEGORIES.STOCK)) {
        handleCategoryChange(ASSET_CATEGORIES.STOCK, true); // Preserve symbol
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const searchSymbol = async () => {
    if (!formData.symbol.trim()) {
      toast({
        title: "Enter Symbol",
        description: "Please enter a stock or crypto symbol to search",
        variant: "destructive"
      });
      return;
    }
    await searchSymbolInternal(formData.symbol);
  };

  // Validation
  const validateForm = () => {
    const newErrors = {};

    // All types require assetCategory and name
    if (!assetCategory) {
      newErrors.assetCategory = 'Please select an asset type';
    }

    // Stocks/Crypto validation
    if (assetCategory === ASSET_CATEGORIES.STOCK || assetCategory === ASSET_CATEGORIES.CRYPTO) {
      if (!formData.symbol || !formData.symbol.trim()) {
        newErrors.symbol = 'Symbol is required';
      }
      if (!formData.name || !formData.name.trim()) {
        newErrors.name = 'Company/Asset name is required';
      }
      if (!formData.shares || parseNumberSafe(formData.shares) <= 0) {
        newErrors.shares = 'Please enter a valid number of shares/units greater than 0';
      }
      if (!formData.avg_cost || parseNumberSafe(formData.avg_cost) <= 0) {
        newErrors.avg_cost = 'Please enter a valid average cost per share greater than 0';
      }
      if (!formData.platform || !formData.platform.trim()) {
        newErrors.platform = 'Platform is required';
      }
    }

    // Cash/HYSA/Bank validation - simplified: just need amount and optional name
    if (assetCategory === ASSET_CATEGORIES.CASH || assetCategory === ASSET_CATEGORIES.HYSA || assetCategory === ASSET_CATEGORIES.BANK) {
      if (!formData.currentBalance || parseNumberSafe(formData.currentBalance) <= 0) {
        newErrors.currentBalance = 'Please enter a valid amount greater than 0';
      }
      // Name is optional - will use default if not provided
    }

    // Home Equity validation
    if (assetCategory === ASSET_CATEGORIES.HOME_EQUITY) {
      if (!formData.propertyName || !formData.propertyName.trim()) {
        newErrors.propertyName = 'Property name is required';
      }
      if (!formData.estimatedValue || parseNumberSafe(formData.estimatedValue) <= 0) {
        newErrors.estimatedValue = 'Please enter a valid estimated value greater than 0';
      }
      const ownershipPct = parseNumberSafe(formData.ownershipPct);
      if (ownershipPct < 1 || ownershipPct > 100) {
        newErrors.ownershipPct = 'Ownership percentage must be between 1 and 100';
      }
    }

    // Other validation
    if (assetCategory === ASSET_CATEGORIES.OTHER) {
      if (!formData.name || !formData.name.trim()) {
        newErrors.name = 'Asset name is required';
      }
      if (!formData.currentValue || parseNumberSafe(formData.currentValue) <= 0) {
        newErrors.currentValue = 'Please enter a valid current value greater than 0';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fix the errors in the form",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      // Map asset categories to backend types (backend now supports all these types)
      const backendType = assetCategory === ASSET_CATEGORIES.STOCK ? 'stock' :
                         assetCategory === ASSET_CATEGORIES.CRYPTO ? 'crypto' :
                         assetCategory === ASSET_CATEGORIES.CASH ? 'cash' :
                         assetCategory === ASSET_CATEGORIES.HYSA ? 'hysa' :
                         assetCategory === ASSET_CATEGORIES.BANK ? 'bank' :
                         assetCategory === ASSET_CATEGORIES.HOME_EQUITY ? 'home_equity' :
                         assetCategory === ASSET_CATEGORIES.OTHER ? 'other' :
                         'roth_ira'; // Fallback
      
      let payload = {
        type: backendType,
        platform: formData.platform || 'Manual'
      };

      // Build payload based on asset category
      if (assetCategory === ASSET_CATEGORIES.STOCK || assetCategory === ASSET_CATEGORIES.CRYPTO) {
        const shares = parseNumberSafe(formData.shares);
        const avgCost = parseNumberSafe(formData.avg_cost);
        payload = {
          ...payload,
          symbol: formData.symbol.toUpperCase().trim(),
          name: formData.name.trim(),
          shares: shares,
          avg_cost: avgCost,
          sector: formData.sector?.trim() || null
        };
      } else if (assetCategory === ASSET_CATEGORIES.CASH || assetCategory === ASSET_CATEGORIES.HYSA || assetCategory === ASSET_CATEGORIES.BANK) {
        const currentBalance = parseNumberSafe(formData.currentBalance);
        
        // Validate balance is greater than 0
        if (currentBalance <= 0) {
          setErrors({ currentBalance: 'Please enter a valid amount greater than 0' });
          setIsLoading(false);
          return;
        }
        
        // Use placeholder symbol for cash/bank accounts (backend requires symbol)
        const symbolPlaceholder = assetCategory === ASSET_CATEGORIES.CASH ? 'CASH' : 
                                  assetCategory === ASSET_CATEGORIES.HYSA ? 'HYSA' : 'BANK';
        // Use account nickname if provided, otherwise use default name
        const accountName = (formData.accountNickname?.trim() || 
                           (assetCategory === ASSET_CATEGORIES.CASH ? 'Cash' :
                            assetCategory === ASSET_CATEGORIES.HYSA ? 'High Yield Savings' : 'Bank Account'));
        
        // Ensure name is not empty
        if (!accountName || accountName.length === 0) {
          setErrors({ accountNickname: 'Account name is required' });
          setIsLoading(false);
          return;
        }
        
        payload = {
          ...payload,
          name: accountName,
          symbol: symbolPlaceholder,
          shares: 1.0,  // Explicitly set as float
          avg_cost: parseFloat(currentBalance.toFixed(2)),  // Ensure it's a proper float
          sector: null
        };
        
        console.log('🔍 AddHoldingModal - HYSA/Cash/Bank payload:', JSON.stringify(payload, null, 2));
      } else if (assetCategory === ASSET_CATEGORIES.HOME_EQUITY) {
        const equity = computeHomeEquity();
        payload = {
          ...payload,
          name: formData.propertyName.trim(),
          symbol: 'HOME', // Placeholder symbol
          shares: 1,
          avg_cost: equity,
          sector: null
        };
      } else if (assetCategory === ASSET_CATEGORIES.OTHER) {
        const currentValue = parseNumberSafe(formData.currentValue);
        payload = {
          ...payload,
          name: formData.name.trim(),
          symbol: 'OTHER', // Placeholder symbol
          shares: 1,
          avg_cost: currentValue,
          sector: null
        };
      }

      // Log payload before sending
      console.log('📤 AddHoldingModal - Final payload being sent:', JSON.stringify(payload, null, 2));
      console.log('📤 AddHoldingModal - Payload field types:', {
        type: typeof payload.type + ' = ' + payload.type,
        symbol: typeof payload.symbol + ' = ' + payload.symbol,
        name: typeof payload.name + ' = ' + payload.name,
        shares: typeof payload.shares + ' = ' + payload.shares,
        avg_cost: typeof payload.avg_cost + ' = ' + payload.avg_cost,
        platform: typeof payload.platform + ' = ' + payload.platform
      });

      const response = await axios.post(`${API}/holdings`, payload, {
        withCredentials: true,
        timeout: 30000
      });
      
      console.log('✅ AddHoldingModal - Success! Response:', response.data);

      toast({
        title: "Holding Added",
        description: `Successfully added ${payload.name} to your portfolio`,
      });

      // Reset form
      handleCategoryChange('');
      setCurrentPrice(null);
      setOpen(false);

      if (onHoldingAdded) {
        onHoldingAdded(response.data);
      }

    } catch (error) {
      console.error('Error adding holding:', error);
      
      let errorMessage = "An error occurred while adding the holding";
      
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        
        // Handle Pydantic validation errors (array of error objects)
        if (Array.isArray(detail)) {
          const firstError = detail[0];
          if (firstError && typeof firstError === 'object' && firstError.msg) {
            errorMessage = firstError.msg;
            // Also set field-specific errors if available
            if (firstError.loc && Array.isArray(firstError.loc)) {
              const fieldName = firstError.loc[firstError.loc.length - 1];
              setErrors(prev => ({
                ...prev,
                [fieldName]: firstError.msg
              }));
            }
          } else {
            errorMessage = "Validation error. Please check your inputs.";
          }
        } 
        // Handle string error messages
        else if (typeof detail === 'string') {
          errorMessage = detail;
        }
        // Handle other object types
        else if (typeof detail === 'object') {
          errorMessage = "Invalid data. Please check your inputs.";
        }
      } else if (error.response?.status === 401) {
        errorMessage = "Please log in to add holdings";
      } else if (error.response?.status === 400) {
        const detail = error.response?.data?.detail;
        if (typeof detail === 'string') {
          errorMessage = detail;
        } else if (Array.isArray(detail)) {
          // Pydantic validation errors
          const firstError = detail[0];
          if (firstError?.msg) {
            errorMessage = `${firstError.loc?.join('.') || 'Field'}: ${firstError.msg}`;
          } else {
            errorMessage = "Validation error. Please check your inputs.";
          }
        } else {
          errorMessage = detail || "Invalid data. Please check your inputs.";
        }
        
        // Log full error for debugging
        console.error('❌ AddHoldingModal - 400 Error details:', {
          status: error.response?.status,
          detail: error.response?.data?.detail,
          payload: error.config?.data ? JSON.parse(error.config.data) : 'N/A'
        });
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = "Request timed out. Please try again.";
      }

      toast({
        title: "Failed to Add Holding",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const calculatePreview = () => {
    if (assetCategory === ASSET_CATEGORIES.STOCK || assetCategory === ASSET_CATEGORIES.CRYPTO) {
      if (!formData.shares || !formData.avg_cost || !currentPrice) return null;

      const shares = parseNumberSafe(formData.shares);
      const avgCost = parseNumberSafe(formData.avg_cost);
      const currentPriceValue = currentPrice.current_price;

      const totalCost = shares * avgCost;
      const totalValue = shares * currentPriceValue;
      const gainLoss = totalValue - totalCost;
      const gainLossPercent = (gainLoss / totalCost) * 100;

      return {
        totalCost,
        totalValue,
        gainLoss,
        gainLossPercent
      };
    }
    return null;
  };

  const preview = calculatePreview();
  const homeEquity = assetCategory === ASSET_CATEGORIES.HOME_EQUITY ? computeHomeEquity() : null;

  // Determine which fields to show
  const showStockCryptoFields = assetCategory === ASSET_CATEGORIES.STOCK || assetCategory === ASSET_CATEGORIES.CRYPTO;
  const showCashBankFields = assetCategory === ASSET_CATEGORIES.CASH || assetCategory === ASSET_CATEGORIES.HYSA || assetCategory === ASSET_CATEGORIES.BANK;
  const showHomeEquityFields = assetCategory === ASSET_CATEGORIES.HOME_EQUITY;
  const showOtherFields = assetCategory === ASSET_CATEGORIES.OTHER;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg">
          <Plus className="w-4 h-4 mr-2" />
          Add Holding
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-xl">
            <div className="flex items-center">
              <div className="p-2 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-lg mr-3">
                <Plus className="w-5 h-5 text-white" />
              </div>
              Add New Holding
            </div>
            {assetCategory && (
              <Badge variant="outline" className="ml-2">
                {ASSET_CATEGORY_LABELS[assetCategory]}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Asset Type Selection */}
          <div className="space-y-2">
            <Label htmlFor="assetCategory">Asset Type *</Label>
            <Select value={assetCategory} onValueChange={handleCategoryChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select asset type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ASSET_CATEGORIES.STOCK}>
                  <div className="flex items-center">
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Stocks
                  </div>
                </SelectItem>
                <SelectItem value={ASSET_CATEGORIES.CRYPTO}>
                  <div className="flex items-center">
                    <DollarSign className="w-4 h-4 mr-2" />
                    Crypto
                  </div>
                </SelectItem>
                <SelectItem value={ASSET_CATEGORIES.CASH}>
                  <div className="flex items-center">
                    <Wallet className="w-4 h-4 mr-2" />
                    Cash
                  </div>
                </SelectItem>
                <SelectItem value={ASSET_CATEGORIES.HYSA}>
                  <div className="flex items-center">
                    <Building2 className="w-4 h-4 mr-2" />
                    HYSA
                  </div>
                </SelectItem>
                <SelectItem value={ASSET_CATEGORIES.BANK}>
                  <div className="flex items-center">
                    <Building2 className="w-4 h-4 mr-2" />
                    Bank Account
                  </div>
                </SelectItem>
                <SelectItem value={ASSET_CATEGORIES.HOME_EQUITY}>
                  <div className="flex items-center">
                    <Home className="w-4 h-4 mr-2" />
                    Home Equity
                  </div>
                </SelectItem>
                <SelectItem value={ASSET_CATEGORIES.OTHER}>
                  Other
                </SelectItem>
              </SelectContent>
            </Select>
            {errors.assetCategory && (
              <p className="text-xs text-red-600">{errors.assetCategory}</p>
            )}
          </div>

          {/* Stocks/Crypto Fields */}
          {showStockCryptoFields && (
            <>
              {/* Symbol Search */}
              <div className="space-y-2">
                <Label htmlFor="symbol">Symbol *</Label>
                <div className="flex space-x-2">
                  <div className="relative flex-1">
                    <Input
                      id="symbol"
                      placeholder="Enter stock or crypto symbol (e.g., AAPL, BTC)"
                      value={formData.symbol}
                      onChange={(e) => handleInputChange('symbol', e.target.value.toUpperCase())}
                      className="pr-8"
                    />
                    {isSearching && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    onClick={searchSymbol}
                    disabled={isSearching}
                    variant="outline"
                    className="px-4"
                  >
                    <Search className="w-4 h-4" />
                  </Button>
                </div>
                {errors.symbol && (
                  <p className="text-xs text-red-600">{errors.symbol}</p>
                )}
              </div>

              {/* Current Price Display */}
              {currentPrice && (
                <Card className="bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-900/20 dark:to-blue-900/20 border-emerald-200 dark:border-[rgba(255,255,255,0.05)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] rounded-2xl">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 dark:text-slate-400">Current Price</p>
                        <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                          ${currentPrice.current_price.toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600 dark:text-slate-400">Source</p>
                        <p className="text-sm font-medium capitalize">{currentPrice.source}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Company/Asset Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Apple Inc."
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                  />
                  {errors.name && (
                    <p className="text-xs text-red-600">{errors.name}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="platform">Platform/Account *</Label>
                  <Input
                    id="platform"
                    placeholder="e.g., Robinhood, Coinbase"
                    value={formData.platform}
                    onChange={(e) => handleInputChange('platform', e.target.value)}
                  />
                  {errors.platform && (
                    <p className="text-xs text-red-600">{errors.platform}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="shares">Shares/Units *</Label>
                  <Input
                    id="shares"
                    type="number"
                    step="0.00000001"
                    min="0"
                    placeholder="e.g., 10 or 0.5"
                    value={formData.shares}
                    onChange={(e) => handleInputChange('shares', e.target.value)}
                  />
                  {errors.shares && (
                    <p className="text-xs text-red-600">{errors.shares}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="avg_cost">Average Cost per Share *</Label>
                  <Input
                    id="avg_cost"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g., 150.00"
                    value={formData.avg_cost}
                    onChange={(e) => handleInputChange('avg_cost', e.target.value)}
                  />
                  {errors.avg_cost && (
                    <p className="text-xs text-red-600">{errors.avg_cost}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sector">Sector (Optional)</Label>
                <Input
                  id="sector"
                  placeholder="e.g., Technology, Healthcare"
                  value={formData.sector}
                  onChange={(e) => handleInputChange('sector', e.target.value)}
                />
              </div>

              {/* Investment Preview */}
              {preview && (
                <Card className="bg-gray-50 dark:bg-[#112334] border-gray-200 dark:border-[rgba(255,255,255,0.05)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] rounded-2xl">
                  <CardContent className="pt-4">
                    <h4 className="font-semibold mb-3 flex items-center text-gray-900 dark:text-slate-200">
                      <TrendingUp className="w-4 h-4 mr-2" />
                      Investment Preview
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600 dark:text-slate-400">Total Cost</p>
                        <p className="font-semibold text-gray-900 dark:text-slate-200">{formatCurrency(preview.totalCost)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 dark:text-slate-400">Current Value</p>
                        <p className="font-semibold text-gray-900 dark:text-slate-200">{formatCurrency(preview.totalValue)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 dark:text-slate-400">Gain/Loss</p>
                        <p className={`font-semibold ${preview.gainLoss >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {preview.gainLoss >= 0 ? '+' : ''}{formatCurrency(preview.gainLoss)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 dark:text-slate-400">Percentage</p>
                        <p className={`font-semibold ${preview.gainLossPercent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {preview.gainLossPercent >= 0 ? '+' : ''}{preview.gainLossPercent.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* Cash/HYSA/Bank Fields - Simplified: Just amount and optional name */}
          {showCashBankFields && (
            <>
              <div className="space-y-2">
                <Label htmlFor="accountNickname">
                  {assetCategory === ASSET_CATEGORIES.CASH ? 'Name (Optional)' : 
                   assetCategory === ASSET_CATEGORIES.HYSA ? 'Account Name (Optional)' : 
                   'Account Name (Optional)'}
                </Label>
                <Input
                  id="accountNickname"
                  placeholder={
                    assetCategory === ASSET_CATEGORIES.CASH ? 'e.g., Emergency Fund, Cash Reserve' :
                    assetCategory === ASSET_CATEGORIES.HYSA ? 'e.g., HYSA - Travel, High Yield Savings' :
                    'e.g., Checking Account, Savings Account'
                  }
                  value={formData.accountNickname}
                  onChange={(e) => handleInputChange('accountNickname', e.target.value)}
                />
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Leave blank to use default name
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currentBalance">
                  {assetCategory === ASSET_CATEGORIES.CASH ? 'Cash Amount *' : 
                   assetCategory === ASSET_CATEGORIES.HYSA ? 'Account Balance *' : 
                   'Account Balance *'}
                </Label>
                <Input
                  id="currentBalance"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formData.currentBalance}
                  onChange={(e) => handleInputChange('currentBalance', e.target.value)}
                  className={errors.currentBalance ? 'border-red-500' : ''}
                  required
                />
                {errors.currentBalance && (
                  <p className="text-xs text-red-600">{errors.currentBalance}</p>
                )}
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Enter the total amount in this account
                </p>
              </div>

            </>
          )}

          {/* Home Equity Fields */}
          {showHomeEquityFields && (
            <>
              <div className="space-y-2">
                <Label htmlFor="propertyName">Property Name *</Label>
                <Input
                  id="propertyName"
                  placeholder="e.g., Primary Home"
                  value={formData.propertyName}
                  onChange={(e) => handleInputChange('propertyName', e.target.value)}
                />
                {errors.propertyName && (
                  <p className="text-xs text-red-600">{errors.propertyName}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="propertyLocation">Location (Optional)</Label>
                <Input
                  id="propertyLocation"
                  placeholder="City, Country"
                  value={formData.propertyLocation}
                  onChange={(e) => handleInputChange('propertyLocation', e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="estimatedValue">Current Estimated Value *</Label>
                  <Input
                    id="estimatedValue"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g., 500000"
                    value={formData.estimatedValue}
                    onChange={(e) => handleInputChange('estimatedValue', e.target.value)}
                  />
                  {errors.estimatedValue && (
                    <p className="text-xs text-red-600">{errors.estimatedValue}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mortgageBalance">Mortgage Balance (Optional)</Label>
                  <Input
                    id="mortgageBalance"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g., 200000"
                    value={formData.mortgageBalance}
                    onChange={(e) => handleInputChange('mortgageBalance', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ownershipPct">Ownership %</Label>
                <Input
                  id="ownershipPct"
                  type="number"
                  step="1"
                  min="1"
                  max="100"
                  placeholder="100"
                  value={formData.ownershipPct}
                  onChange={(e) => handleInputChange('ownershipPct', e.target.value)}
                />
                {errors.ownershipPct && (
                  <p className="text-xs text-red-600">{errors.ownershipPct}</p>
                )}
              </div>

              {homeEquity !== null && (
                <Card className="bg-gray-50 dark:bg-[#112334] border-gray-200 dark:border-[rgba(255,255,255,0.05)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] rounded-2xl">
                  <CardContent className="pt-4">
                    <p className="text-sm text-gray-600 dark:text-slate-400">Estimated Equity</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-slate-200">
                      {formatCurrency(homeEquity)}
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* Other Fields */}
          {showOtherFields && (
            <>
              <div className="space-y-2">
                <Label htmlFor="name">Asset Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Art Collection, Precious Metals"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                />
                {errors.name && (
                  <p className="text-xs text-red-600">{errors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Additional details about this asset"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currentValue">Current Value *</Label>
                <Input
                  id="currentValue"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g., 10000.00"
                  value={formData.currentValue}
                  onChange={(e) => handleInputChange('currentValue', e.target.value)}
                />
                {errors.currentValue && (
                  <p className="text-xs text-red-600">{errors.currentValue}</p>
                )}
              </div>
            </>
          )}

          {/* Submit Buttons */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-[rgba(255,255,255,0.05)]">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                  Adding...
                </>
              ) : (
                <>
                  <DollarSign className="w-4 h-4 mr-2" />
                  Add Holding
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddHoldingModal;
