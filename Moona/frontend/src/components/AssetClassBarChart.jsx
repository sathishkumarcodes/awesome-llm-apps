import React, { useState } from 'react';
import { X, BarChart3 } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

const AssetClassBarChart = ({ holdings }) => {
  const [hiddenSymbols, setHiddenSymbols] = useState(new Set());
  const [filterByAssetType, setFilterByAssetType] = useState('all');

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (percent) => {
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(2)}%`;
  };

  // Generate unique colors for each holding
  const getHoldingColor = (index, symbol) => {
    const colors = [
      '#dc2626', '#f97316', '#f59e0b', '#eab308', '#84cc16',
      '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6',
      '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
      '#f43f5e', '#ef4444', '#dc2626', '#991b1b', '#7f1d1d',
      '#9a3412', '#7c2d12', '#78350f', '#713f12', '#854d0e'
    ];
    // Use symbol hash for consistent color
    let hash = 0;
    for (let i = 0; i < symbol.length; i++) {
      hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // Calculate data for individual holdings
  const calculateHoldingsData = () => {
    if (!holdings || holdings.length === 0) return [];

    return holdings
      .map((holding, index) => {
        const investment = holding.total_cost || 0;
        const gainLoss = holding.gain_loss || 0;
        const currentValue = holding.total_value || 0;
        const returnPercent = holding.gain_loss_percent || 0;
        const symbol = holding.symbol || 'N/A';
        const assetType = holding.type || 'other';

        return {
          symbol,
          name: holding.name || symbol,
          assetType,
          investment,
          gainLoss,
          currentValue,
          returnPercent,
          color: getHoldingColor(index, symbol)
        };
      })
      .filter(item => {
        // Filter by asset type
        if (filterByAssetType !== 'all') {
          const normalizedType = item.assetType.toLowerCase().replace('_', ' ');
          const filterType = filterByAssetType.toLowerCase().replace('_', ' ');
          if (normalizedType !== filterType) return false;
        }
        // Filter by hidden symbols
        return !hiddenSymbols.has(item.symbol);
      })
      .sort((a, b) => b.returnPercent - a.returnPercent); // Sort by return percentage
  };

  const holdingsData = calculateHoldingsData();

  // Get all available asset types for filter
  const allAssetTypes = React.useMemo(() => {
    if (!holdings || holdings.length === 0) return [];
    const types = new Set();
    holdings.forEach(h => {
      const type = h.type || 'other';
      types.add(type);
    });
    return Array.from(types).sort();
  }, [holdings]);

  const toggleSymbol = (symbol) => {
    setHiddenSymbols(prev => {
      const newSet = new Set(prev);
      if (newSet.has(symbol)) {
        newSet.delete(symbol);
      } else {
        newSet.add(symbol);
      }
      return newSet;
    });
  };

  if (!holdings || holdings.length === 0) {
    return (
      <div className="h-96 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-3 bg-gray-200 rounded-full flex items-center justify-center">
            <BarChart3 className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-600">No holdings data available</p>
          <p className="text-xs text-gray-400 mt-1">Add holdings to see asset class breakdown</p>
        </div>
      </div>
    );
  }

  // Chart dimensions
  const width = 1000;
  const height = Math.max(600, holdingsData.length * 30 + 100);
  const margin = { top: 40, right: 150, bottom: 40, left: 100 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Calculate max return percentage for scaling
  const maxReturn = Math.max(
    ...holdingsData.map(d => Math.abs(d.returnPercent)),
    Math.abs(Math.min(...holdingsData.map(d => d.returnPercent), 0)),
    1
  );
  
  const barHeight = chartHeight / Math.max(holdingsData.length, 1);
  const barSpacing = 4;
  const actualBarHeight = barHeight - barSpacing;

  // Scale function for return percentage (centered at 0)
  const xScale = (returnPercent) => {
    // Center at 0, scale based on max return
    const centerX = chartWidth / 2;
    const scale = (chartWidth / 2) / maxReturn;
    return centerX + (returnPercent * scale);
  };

  return (
    <div className="w-full">
      {/* Filter Section */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <h4 className="text-sm font-semibold text-gray-700">Filters</h4>
          <div className="flex items-center gap-3">
            {/* Asset Type Filter */}
            <select
              value={filterByAssetType}
              onChange={(e) => setFilterByAssetType(e.target.value)}
              className="text-xs px-3 py-1.5 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Asset Types</option>
              {allAssetTypes.map(type => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')}
                </option>
              ))}
            </select>
            {hiddenSymbols.size > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setHiddenSymbols(new Set())}
                className="text-xs h-7"
              >
                Show All Holdings
              </Button>
            )}
          </div>
        </div>
        {/* Quick filter badges for top holdings */}
        {holdingsData.length > 0 && holdingsData.length <= 30 && (
          <div className="flex flex-wrap gap-2">
            {holdingsData.slice(0, 20).map((item) => {
              const isHidden = hiddenSymbols.has(item.symbol);
              return (
                <Badge
                  key={item.symbol}
                  variant={isHidden ? "outline" : "default"}
                  className={`cursor-pointer transition-all text-xs ${
                    isHidden 
                      ? 'bg-gray-100 text-gray-400 border-gray-300' 
                      : 'text-white'
                  }`}
                  style={!isHidden ? { backgroundColor: item.color } : {}}
                  onClick={() => toggleSymbol(item.symbol)}
                >
                  {item.symbol}
                  {isHidden && <X className="w-3 h-3 ml-1" />}
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="overflow-x-auto -mx-4 px-4">
        <svg width={width} height={height} className="min-w-full">
          <defs>
            {/* Gradient for investment portion */}
            <linearGradient id="investmentGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6b7280" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#9ca3af" stopOpacity="0.8" />
            </linearGradient>
            {/* Gradient for gain portion */}
            <linearGradient id="gainGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.9" />
            </linearGradient>
            {/* Gradient for loss portion */}
            <linearGradient id="lossGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#dc2626" stopOpacity="0.9" />
            </linearGradient>
            {/* Shadow filter */}
            <filter id="barShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
              <feOffset dx="0" dy="2" result="offsetblur" />
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.3" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background */}
          <rect width={width} height={height} fill="white" rx="8" />

          {/* Title */}
          <text
            x={width / 2}
            y={25}
            textAnchor="middle"
            fontSize="18"
            fill="#111827"
            fontWeight="700"
          >
            Total Return
          </text>

          {/* Chart area */}
          <g transform={`translate(${margin.left}, ${margin.top})`}>
            {/* Center line (0% return) */}
            <line
              x1={chartWidth / 2}
              y1={0}
              x2={chartWidth / 2}
              y2={chartHeight}
              stroke="#d1d5db"
              strokeWidth={2}
            />

            {/* Grid lines for return percentages */}
            {[-maxReturn, -maxReturn * 0.5, 0, maxReturn * 0.5, maxReturn].map((returnPercent, index) => {
              const x = xScale(returnPercent);
              return (
                <g key={index}>
                  <line
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={chartHeight}
                    stroke={returnPercent === 0 ? "#9ca3af" : "#e5e7eb"}
                    strokeWidth={returnPercent === 0 ? 2 : 1}
                    strokeDasharray={returnPercent === 0 ? "none" : "2,2"}
                    opacity="0.6"
                  />
                  <text
                    x={x}
                    y={-10}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#6b7280"
                    fontWeight="500"
                  >
                    {formatPercent(returnPercent)}
                  </text>
                </g>
              );
            })}

            {/* Bars - showing total return percentage */}
            {holdingsData.map((item, index) => {
              const y = index * barHeight;
              const centerX = chartWidth / 2;
              const returnPercent = item.returnPercent;
              const barEndX = xScale(returnPercent);
              const isPositive = returnPercent >= 0;
              
              // Bar extends from center (0%) to the return percentage
              const barStartX = isPositive ? centerX : barEndX;
              const barWidth = Math.abs(barEndX - centerX);

              return (
                <g key={item.symbol}>
                  {/* Bar */}
                  <rect
                    x={barStartX}
                    y={y}
                    width={barWidth}
                    height={actualBarHeight}
                    fill={item.color}
                    rx="3"
                    filter="url(#barShadow)"
                    opacity="0.85"
                  />

                  {/* Symbol label */}
                  <text
                    x={-10}
                    y={y + actualBarHeight / 2 + 4}
                    textAnchor="end"
                    fontSize="12"
                    fill="#374151"
                    fontWeight="600"
                  >
                    {item.symbol}
                  </text>

                  {/* Return percentage at end of bar */}
                  <text
                    x={isPositive ? barEndX + 8 : barEndX - 8}
                    y={y + actualBarHeight / 2 + 4}
                    fontSize="11"
                    fill={isPositive ? "#059669" : "#dc2626"}
                    fontWeight="600"
                    textAnchor={isPositive ? "start" : "end"}
                  >
                    {formatPercent(returnPercent)}
                  </text>

                  {/* Current value label (optional, if space allows) */}
                  {barWidth > 100 && (
                    <text
                      x={barStartX + barWidth / 2}
                      y={y + actualBarHeight / 2 + 4}
                      fontSize="10"
                      fill="white"
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      {formatCurrency(item.currentValue)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* X-axis line */}
            <line
              x1={0}
              y1={chartHeight}
              x2={chartWidth}
              y2={chartHeight}
              stroke="#d1d5db"
              strokeWidth={2}
            />
          </g>
        </svg>
      </div>

      {/* Summary Stats */}
      {holdingsData.length > 0 && (
        <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-xs text-gray-600 mb-1">Total Holdings</div>
              <div className="text-xl font-bold text-gray-900">{holdingsData.length}</div>
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Avg Return</div>
              <div className={`text-xl font-bold ${holdingsData.reduce((sum, h) => sum + h.returnPercent, 0) / holdingsData.length >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatPercent(holdingsData.reduce((sum, h) => sum + h.returnPercent, 0) / holdingsData.length)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Best Performer</div>
              <div className="text-lg font-bold text-gray-900">
                {holdingsData[0]?.symbol} {formatPercent(holdingsData[0]?.returnPercent || 0)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Total Value</div>
              <div className="text-xl font-bold text-gray-900">
                {formatCurrency(holdingsData.reduce((sum, h) => sum + h.currentValue, 0))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetClassBarChart;

