import React, { useState, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import AssetAllocationSection from './AssetAllocationSection';

// Helper functions (defined outside component to avoid dependency issues)
const formatAssetTypeName = (type) => {
  const names = {
    'stock': 'Stocks',
    'stocks': 'Stocks',
    'crypto': 'Crypto',
    'cryptocurrency': 'Crypto',
    'roth_ira': 'Roth IRA',
    'roth ira': 'Roth IRA',
    'cash': 'Cash',
    'hysa': 'HYSA',
    'bank': 'Bank Account',
    'home_equity': 'Home Equity',
    'home equity': 'Home Equity',
    'etf': 'ETF',
    'bond': 'Bonds',
    '401k': '401(k)',
    '529': '529 Plan',
    'child_roth': "Child's Roth IRA",
    'childs_roth': "Child's Roth IRA",
    'hsa': 'HSA',
    'traditional_ira': 'Traditional IRA',
    'sep_ira': 'SEP IRA',
    'other': 'Other'
  };
  const normalized = type?.toLowerCase().replace(/\s+/g, '_');
  return names[normalized] || type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const getAssetTypeColor = (assetType) => {
  const normalized = assetType?.toLowerCase().replace(/\s+/g, '_');
  const colors = {
    // Stocks
    'stock': '#22C55E',      // emerald-500 - vibrant green
    'stocks': '#22C55E',
    
    // Crypto
    'crypto': '#EF4444',     // red-500 - distinct red
    'cryptocurrency': '#EF4444',
    
    // Bonds
    'bond': '#3B82F6',       // blue-500 - bright blue
    'bonds': '#3B82F6',
    
    // Cash & Bank Accounts
    'cash': '#FACC15',       // yellow-400 - bright yellow
    'hysa': '#FBBF24',       // amber-400 - amber
    'bank': '#FCD34D',       // yellow-300 - lighter yellow
    'bank account': '#FCD34D',
    
    // Real Estate
    'home_equity': '#C084FC', // purple-400 - lighter purple
    'home equity': '#C084FC',
    
    // Retirement Accounts
    'roth_ira': '#7C3AED',    // violet-600 - deep purple
    'roth ira': '#7C3AED',
    'child_roth': '#A855F7',  // purple-500 - medium purple
    'childs_roth': '#A855F7',
    'traditional_ira': '#6366F1', // indigo-500 - indigo
    'traditional ira': '#6366F1',
    'sep_ira': '#8B5CF6',     // violet-500 - violet
    'sep ira': '#8B5CF6',
    
    // Investment Accounts
    'etf': '#06B6D4',         // cyan-500 - cyan
    '401k': '#10B981',        // emerald-500 - emerald
    '401(k)': '#10B981',
    '529': '#14B8A6',         // teal-500 - teal
    '529 plan': '#14B8A6',
    
    // Health Savings
    'hsa': '#F97316',         // orange-500 - orange
    
    // Other
    'other': '#6B7280'        // gray-500 - neutral gray
  };
  return colors[normalized] || colors['other'];
};

const AssetClassBreakdown = ({ holdings, dailyChangePct, dailyChangeValue }) => {
  // ALL HOOKS MUST BE CALLED FIRST, BEFORE ANY CONDITIONAL RETURNS
  const [isExpanded, setIsExpanded] = useState(true);

  // Calculate breakdown by asset class - MUST be before early returns
  const assetClassData = useMemo(() => {
    if (!holdings || holdings.length === 0) return [];

    const breakdown = {};

    holdings.forEach((holding, index) => {
      const assetType = (holding.type || holding.assetType || 'other').toLowerCase();
      const normalizedType = assetType === 'cryptocurrency' ? 'crypto' : 
                            assetType === 'stocks' ? 'stock' : 
                            assetType === 'roth ira' ? 'roth_ira' :
                            assetType === 'home equity' ? 'home_equity' : assetType;

      if (!breakdown[normalizedType]) {
        breakdown[normalizedType] = {
          assetType: normalizedType,
          investment: 0,
          currentValue: 0,
          gainLoss: 0,
          count: 0  // Track number of holdings in this asset class
        };
      }

      // Handle different field names for cost and value
      const investment = holding.total_cost || holding.costBasis || holding.investment || 
                        (holding.avg_cost && holding.shares ? holding.avg_cost * holding.shares : 0) ||
                        (holding.average_cost && holding.quantity ? holding.average_cost * holding.quantity : 0) || 0;
      const currentValue = holding.total_value || holding.currentValue || holding.value ||
                          (holding.current_price && holding.shares ? holding.current_price * holding.shares : 0) ||
                          (holding.price && holding.quantity ? holding.price * holding.quantity : 0) || 0;
      const gainLoss = currentValue - investment;
      
      console.log(`💰 Holding ${index} (${holding.symbol || holding.name}):`, {
        originalType: assetType,
        normalizedType: normalizedType,
        investment,
        currentValue,
        gainLoss,
        holdingKeys: Object.keys(holding),
        rawHolding: holding
      });

      breakdown[normalizedType].investment += investment;
      breakdown[normalizedType].currentValue += currentValue;
      breakdown[normalizedType].gainLoss += gainLoss;
      breakdown[normalizedType].count += 1;  // Increment count
    });

    // Convert to array and calculate percentages
    const totalValue = Object.values(breakdown).reduce((sum, item) => sum + item.currentValue, 0);
    
    const result = Object.values(breakdown)
      .map(item => ({
        ...item,
        percentageGain: item.investment > 0 
          ? ((item.gainLoss / item.investment) * 100) 
          : 0,
        percentage: totalValue > 0 ? (item.currentValue / totalValue) * 100 : 0
      }))
      .sort((a, b) => b.currentValue - a.currentValue); // Sort by current value descending
    
    console.log('✅ AssetClassBreakdown - Breakdown calculated:', {
      breakdownCount: Object.keys(breakdown).length,
      totalValue,
      result,
      breakdownDetails: Object.entries(breakdown).map(([type, data]) => ({
        type,
        count: data.count,
        investment: data.investment,
        currentValue: data.currentValue
      }))
    });
    
    return result;
  }, [holdings]);

  // Prepare assets for AssetAllocationSection - MUST be before early returns
  const allocationAssets = useMemo(() => {
    if (!assetClassData || assetClassData.length === 0) return [];
    
    return assetClassData.map(item => ({
      name: formatAssetTypeName(item.assetType),
      color: getAssetTypeColor(item.assetType),
      costBasis: item.investment,
      currentValue: item.currentValue,
      gainLoss: item.gainLoss,
      gainPct: item.percentageGain,
      portfolioPct: item.percentage
    }));
  }, [assetClassData]);

  const totalValue = useMemo(() => {
    return assetClassData.reduce((sum, item) => sum + item.currentValue, 0);
  }, [assetClassData]);

  // Debug: Log holdings to see what we're receiving - MUST be before early returns
  useEffect(() => {
    console.log('🔍 AssetClassBreakdown - Holdings received:', {
      holdings,
      isArray: Array.isArray(holdings),
      length: holdings?.length,
      firstHolding: holdings?.[0],
      allHoldings: holdings
    });
  }, [holdings]);

  // Helper functions (not hooks, can be defined here)
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatPercent = (percent) => {
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(2)}%`;
  };

  // Show empty state instead of returning null
  if (!holdings || holdings.length === 0) {
    return (
      <Card className="bg-white/80 dark:bg-[#112334] border border-gray-200 dark:border-[rgba(255,255,255,0.05)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] rounded-2xl mb-6 overflow-hidden">
        <CardContent className="p-6">
          <p className="text-sm text-gray-600 dark:text-slate-400 text-center">
            No holdings yet. Add your first holding to see asset class breakdown.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (assetClassData.length === 0) {
    return (
      <Card className="bg-white/80 dark:bg-[#112334] border border-gray-200 dark:border-[rgba(255,255,255,0.05)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] rounded-2xl mb-6 overflow-hidden">
        <CardContent className="p-6">
          <p className="text-sm text-gray-600 dark:text-slate-400 text-center">
            Unable to calculate asset breakdown. Please refresh the page.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/80 dark:bg-[#112334] border border-gray-200 dark:border-[rgba(255,255,255,0.05)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] rounded-2xl mb-6 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-opacity-80 transition-colors duration-200"
      >
        <div className="flex items-center space-x-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-200">Asset Class Breakdown</h3>
          <span className="text-sm text-gray-500 dark:text-slate-400 font-normal">
            ({assetClassData.length} {assetClassData.length === 1 ? 'class' : 'classes'})
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-gray-500 dark:text-slate-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-500 dark:text-slate-400" />
        )}
      </button>

      {isExpanded && (
        <CardContent className="px-0 pb-0 pt-0">
          <AssetAllocationSection
            assets={allocationAssets}
            totalValue={totalValue}
            dailyChangePct={dailyChangePct}
            dailyChangeValue={dailyChangeValue}
          />
        </CardContent>
      )}
    </Card>
  );
};

export default AssetClassBreakdown;

