import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { PieChart as PieChartIcon } from 'lucide-react';
import PortfolioPieChart from './PortfolioPieChart';

const AssetBreakdownCard = ({ holdings, portfolioAllocation }) => {
  if (!holdings || holdings.length === 0) {
    return (
      <Card className="bg-white/80 dark:bg-[#112334] backdrop-blur-sm border-0 dark:border-[rgba(255,255,255,0.05)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] shadow-sm rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-gray-800 dark:text-slate-200 flex items-center">
            <PieChartIcon className="w-4 h-4 mr-2 text-gray-600 dark:text-slate-400" />
            Asset Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="p-8">
          <div className="h-48 flex items-center justify-center text-gray-500 dark:text-slate-400 text-sm">
            No holdings yet
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group holdings by asset type
  const assetTypeMap = {};
  let totalValue = 0;

  holdings.forEach(holding => {
    const type = holding.type || holding.asset_type || 'Other';
    const value = holding.total_value || holding.current_value || 0;
    
    if (!assetTypeMap[type]) {
      assetTypeMap[type] = {
        type,
        value: 0,
        count: 0
      };
    }
    assetTypeMap[type].value += value;
    assetTypeMap[type].count += 1;
    totalValue += value;
  });

  const assetTypes = Object.values(assetTypeMap)
    .map(item => ({
      ...item,
      percentage: totalValue > 0 ? (item.value / totalValue) * 100 : 0
    }))
    .sort((a, b) => b.value - a.value);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Card className="bg-white/80 dark:bg-[#112334] backdrop-blur-sm border-0 dark:border-[rgba(255,255,255,0.05)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] shadow-sm rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-gray-800 dark:text-slate-200 flex items-center">
          <PieChartIcon className="w-4 h-4 mr-2 text-gray-600 dark:text-slate-400" />
          Asset Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="p-8">
        <div className="space-y-4">
          {/* Compact Pie Chart */}
          <div className="flex justify-center">
            <PortfolioPieChart
              holdings={holdings}
              size={200}
              showLabels={false}
            />
          </div>

          {/* Table */}
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-gray-600 dark:text-slate-400 border-b border-gray-200 dark:border-[rgba(255,255,255,0.04)] pb-2">
              <div>Asset Class</div>
              <div className="text-right">Allocation</div>
              <div className="text-right">Value</div>
            </div>
            {assetTypes.slice(0, 5).map((item, idx) => (
              <div key={idx} className="grid grid-cols-3 gap-2 text-sm">
                <div className="font-medium text-gray-700 dark:text-slate-300 truncate">{item.type}</div>
                <div className="text-right text-gray-600 dark:text-slate-400">{item.percentage.toFixed(1)}%</div>
                <div className="text-right text-gray-700 dark:text-slate-300 font-medium">{formatCurrency(item.value)}</div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AssetBreakdownCard;

