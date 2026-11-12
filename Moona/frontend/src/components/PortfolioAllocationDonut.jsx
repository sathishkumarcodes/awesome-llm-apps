import React, { useState, useMemo } from 'react';

/**
 * PortfolioAllocationDonut - Moona-style donut chart for asset allocation
 * 
 * @param {Object} props
 * @param {Array<{type: string, value: number, color?: string}>} props.assets - Array of asset slices
 * @param {number} props.totalValue - Total portfolio value
 * @param {number} [props.dailyChangePct] - Daily change percentage (e.g., 0.2982 for +29.82%)
 * @param {number} [props.dailyChangeValue] - Daily change value in dollars
 * @param {boolean} [props.showLegend] - Whether to show the legend (default: true)
 */
const PortfolioAllocationDonut = ({ 
  assets = [], 
  totalValue = 0, 
  dailyChangePct, 
  dailyChangeValue,
  showLegend = true
}) => {
  const [hoveredSlice, setHoveredSlice] = useState(null);
  const [hoveredLegend, setHoveredLegend] = useState(null);

  // Expanded color palette with distinct colors for all asset types
  const defaultColors = {
    // Stocks
    'Stocks': '#22C55E',      // emerald-500 - vibrant green
    'stocks': '#22C55E',
    'stock': '#22C55E',
    
    // Crypto
    'Crypto': '#EF4444',      // red-500 - distinct red
    'crypto': '#EF4444',
    'cryptocurrency': '#EF4444',
    
    // Bonds
    'Bonds': '#3B82F6',       // blue-500 - bright blue
    'bonds': '#3B82F6',
    'bond': '#3B82F6',
    
    // Cash & Bank Accounts
    'Cash': '#FACC15',        // yellow-400 - bright yellow
    'cash': '#FACC15',
    'HYSA': '#FBBF24',       // amber-400 - amber
    'hysa': '#FBBF24',
    'Bank Account': '#FCD34D', // yellow-300 - lighter yellow
    'bank': '#FCD34D',
    'bank account': '#FCD34D',
    
    // Real Estate
    'Real Estate': '#A78BFA',  // violet-400 - purple
    'real estate': '#A78BFA',
    'real_estate': '#A78BFA',
    'Home Equity': '#C084FC',  // purple-400 - lighter purple
    'home_equity': '#C084FC',
    'home equity': '#C084FC',
    
    // Retirement Accounts
    'Roth IRA': '#7C3AED',     // violet-600 - deep purple
    'roth_ira': '#7C3AED',
    'roth ira': '#7C3AED',
    "Child's Roth IRA": '#A855F7', // purple-500 - medium purple
    'child_roth': '#A855F7',
    'childs_roth': '#A855F7',
    'Traditional IRA': '#6366F1',  // indigo-500 - indigo
    'traditional_ira': '#6366F1',
    'traditional ira': '#6366F1',
    'SEP IRA': '#8B5CF6',      // violet-500 - violet
    'sep_ira': '#8B5CF6',
    'sep ira': '#8B5CF6',
    
    // Investment Accounts
    'ETF': '#06B6D4',         // cyan-500 - cyan
    'etf': '#06B6D4',
    '401(k)': '#10B981',      // emerald-500 - emerald
    '401k': '#10B981',
    '529 Plan': '#14B8A6',    // teal-500 - teal
    '529': '#14B8A6',
    '529 plan': '#14B8A6',
    
    // Health Savings
    'HSA': '#F97316',         // orange-500 - orange
    'hsa': '#F97316',
    
    // Other
    'Other': '#6B7280',       // gray-500 - neutral gray
    'other': '#6B7280',
  };

  // Extended color palette for fallback (distinct, vibrant colors)
  const colorPalette = [
    '#22C55E', // emerald-500 - green
    '#EF4444', // red-500 - red
    '#3B82F6', // blue-500 - blue
    '#FACC15', // yellow-400 - yellow
    '#A78BFA', // violet-400 - purple
    '#F97316', // orange-500 - orange
    '#7C3AED', // violet-600 - deep purple
    '#06B6D4', // cyan-500 - cyan
    '#10B981', // emerald-500 - emerald
    '#14B8A6', // teal-500 - teal
    '#FBBF24', // amber-400 - amber
    '#C084FC', // purple-400 - light purple
    '#A855F7', // purple-500 - medium purple
    '#6366F1', // indigo-500 - indigo
    '#8B5CF6', // violet-500 - violet
    '#FCD34D', // yellow-300 - light yellow
    '#EC4899', // pink-500 - pink
    '#84CC16', // lime-500 - lime
  ];

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatPercent = (percent) => {
    return `${percent.toFixed(1)}%`;
  };

  const getAssetColor = (type, customColor) => {
    if (customColor) return customColor;
    const normalized = type?.toLowerCase().trim();
    return defaultColors[normalized] || defaultColors[type] || colorPalette[0];
  };

  // Process assets: calculate percentages, sort, and group if needed
  const processedAssets = useMemo(() => {
    if (!assets || assets.length === 0 || totalValue === 0) return [];

    // Calculate percentages and add colors
    let processed = assets
      .map(asset => ({
        ...asset,
        percentage: totalValue > 0 ? (asset.value / totalValue) * 100 : 0,
        color: getAssetColor(asset.type, asset.color)
      }))
      .filter(asset => asset.value > 0)
      .sort((a, b) => b.value - a.value); // Sort by descending value

    // If more than 6 asset types, group the rest into "Other"
    if (processed.length > 6) {
      const top5 = processed.slice(0, 5);
      const others = processed.slice(5);
      const otherValue = others.reduce((sum, item) => sum + item.value, 0);
      const otherPercentage = totalValue > 0 ? (otherValue / totalValue) * 100 : 0;

      return [
        ...top5,
        {
          type: 'Other',
          value: otherValue,
          percentage: otherPercentage,
          color: defaultColors['Other'],
          isGrouped: true,
          groupedCount: others.length
        }
      ];
    }

    return processed;
  }, [assets, totalValue]);

  // Empty state
  if (!assets || assets.length === 0 || totalValue === 0) {
    return (
      <div className="w-full">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          {/* Placeholder Donut */}
          <div className="flex justify-center lg:w-1/2">
            <div className="relative">
              <svg width={300} height={300} className="overflow-visible">
                <circle
                  cx={150}
                  cy={150}
                  r={100}
                  fill="none"
                  stroke="rgba(148, 163, 184, 0.2)"
                  strokeWidth="40"
                  className="dark:stroke-slate-700"
                />
                <circle
                  cx={150}
                  cy={150}
                  r={60}
                  fill="none"
                  stroke="rgba(148, 163, 184, 0.1)"
                  strokeWidth="40"
                  className="dark:stroke-slate-800"
                />
                <text
                  x={150}
                  y={140}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-sm font-medium fill-gray-600 dark:fill-slate-400"
                >
                  No assets yet
                </text>
                <text
                  x={150}
                  y={160}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-xs fill-gray-500 dark:fill-slate-500"
                >
                  Add your first holding
                </text>
              </svg>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Chart dimensions
  const size = 300;
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = 100;
  const innerRadius = 70; // Medium thickness ring (~30% of radius)
  const hoverRadius = radius + 3; // Slightly expand on hover

  let cumulativePercentage = 0;

  // Generate segments
  const segments = processedAssets.map((asset, idx) => {
    const startAngle = (cumulativePercentage / 100) * 360;
    const endAngle = ((cumulativePercentage + asset.percentage) / 100) * 360;
    cumulativePercentage += asset.percentage;

    const startAngleRad = ((startAngle - 90) * Math.PI) / 180;
    const endAngleRad = ((endAngle - 90) * Math.PI) / 180;
    const midAngleRad = ((startAngle + endAngle) / 2 - 90) * Math.PI / 180;

    // Use hover radius if this slice is hovered
    const currentRadius = (hoveredSlice === idx || hoveredLegend === idx) ? hoverRadius : radius;
    const currentInnerRadius = (hoveredSlice === idx || hoveredLegend === idx) ? innerRadius + 3 : innerRadius;

    // Outer arc
    const x1 = centerX + currentRadius * Math.cos(startAngleRad);
    const y1 = centerY + currentRadius * Math.sin(startAngleRad);
    const x2 = centerX + currentRadius * Math.cos(endAngleRad);
    const y2 = centerY + currentRadius * Math.sin(endAngleRad);

    // Inner arc
    const x3 = centerX + currentInnerRadius * Math.cos(endAngleRad);
    const y3 = centerY + currentInnerRadius * Math.sin(endAngleRad);
    const x4 = centerX + currentInnerRadius * Math.cos(startAngleRad);
    const y4 = centerY + currentInnerRadius * Math.sin(startAngleRad);

    const largeArcFlag = asset.percentage > 50 ? 1 : 0;

    const pathData = [
      `M ${x1} ${y1}`,
      `A ${currentRadius} ${currentRadius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${currentInnerRadius} ${currentInnerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4}`,
      'Z'
    ].join(' ');

    // Label position (only show if percentage > 3%)
    const labelRadius = currentRadius + 20;
    const labelX = centerX + labelRadius * Math.cos(midAngleRad);
    const labelY = centerY + labelRadius * Math.sin(midAngleRad);

    return {
      ...asset,
      pathData,
      labelX,
      labelY,
      startAngle,
      endAngle,
      midAngleRad,
      idx,
      opacity: hoveredSlice !== null && hoveredSlice !== idx && hoveredLegend === null 
        ? 0.3 
        : hoveredLegend !== null && hoveredLegend !== idx && hoveredSlice === null
        ? 0.3
        : 1
    };
  });

  return (
    <div className="w-full">
      <div className={`${showLegend ? 'grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6 items-center' : 'flex justify-center'}`}>
        {/* Donut Chart */}
        <div className="flex justify-center">
          <div className="relative">
            <svg 
              width={size} 
              height={size} 
              className="overflow-visible drop-shadow-md"
              viewBox={`0 0 ${size} ${size}`}
            >
              <defs>
                {segments.map((seg, idx) => (
                  <filter key={idx} id={`donut-glow-${idx}`}>
                    <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                ))}
                {/* Rounded caps effect */}
                <filter id="rounded-caps">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="1"/>
                </filter>
              </defs>

              {/* Segments */}
              {segments.map((seg, idx) => (
                <g key={idx}>
                  <path
                    d={seg.pathData}
                    fill={seg.color}
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="2"
                    filter={`url(#donut-glow-${idx})`}
                    className="transition-all duration-200 cursor-pointer"
                    style={{ 
                      opacity: seg.opacity,
                      transformOrigin: `${centerX}px ${centerY}px`
                    }}
                    onMouseEnter={() => setHoveredSlice(idx)}
                    onMouseLeave={() => setHoveredSlice(null)}
                  />
                  {/* Label for larger segments */}
                  {seg.percentage > 3 && (
                    <text
                      x={seg.labelX}
                      y={seg.labelY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="text-xs font-semibold fill-gray-900 dark:fill-slate-200 pointer-events-none transition-opacity"
                      style={{ opacity: seg.opacity }}
                    >
                      {seg.type}
                    </text>
                  )}
                </g>
              ))}

              {/* Center Text */}
              <g>
                <text
                  x={centerX}
                  y={centerY - 20}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-xs fill-gray-600 dark:fill-slate-400 pointer-events-none"
                >
                  Portfolio Value
                </text>
                <text
                  x={centerX}
                  y={centerY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-lg font-semibold fill-gray-900 dark:fill-slate-100 pointer-events-none"
                >
                  {formatCurrency(totalValue)}
                </text>
                {dailyChangePct !== undefined && dailyChangePct !== null && (
                  <text
                    x={centerX}
                    y={centerY + 18}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={`text-xs font-medium pointer-events-none ${
                      dailyChangePct >= 0 
                        ? 'fill-emerald-500 dark:fill-emerald-400' 
                        : 'fill-red-500 dark:fill-red-400'
                    }`}
                  >
                    {dailyChangePct >= 0 ? '↑' : '↓'} {formatPercent(Math.abs(dailyChangePct))}
                    {dailyChangeValue !== undefined && dailyChangeValue !== null && (
                      <tspan className="fill-gray-600 dark:fill-slate-400">
                        {' '}({formatCurrency(Math.abs(dailyChangeValue))})
                      </tspan>
                    )}
                  </text>
                )}
              </g>
            </svg>

            {/* Tooltip */}
            {hoveredSlice !== null && segments[hoveredSlice] && (
              <div
                className="absolute bg-gray-900 dark:bg-slate-800 text-white dark:text-slate-100 px-3 py-2 rounded-lg shadow-lg text-xs font-medium pointer-events-none z-10 border border-gray-700 dark:border-slate-600"
                style={{
                  left: `${segments[hoveredSlice].labelX}px`,
                  top: `${segments[hoveredSlice].labelY}px`,
                  transform: 'translate(-50%, -100%)',
                  marginTop: '-8px'
                }}
              >
                {segments[hoveredSlice].type} · {formatPercent(segments[hoveredSlice].percentage)} · {formatCurrency(segments[hoveredSlice].value)}
              </div>
            )}
          </div>
        </div>

        {/* Legend - Only show if showLegend is true */}
        {showLegend && (
          <div className="space-y-3">
            {processedAssets.map((asset, idx) => {
              const isHovered = hoveredSlice === idx || hoveredLegend === idx;
              return (
                <div
                  key={idx}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all duration-200 cursor-pointer ${
                    isHovered
                      ? 'bg-gray-100 dark:bg-slate-700/80 border-gray-300 dark:border-slate-600'
                      : 'bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-[rgba(255,255,255,0.05)] hover:bg-gray-100 dark:hover:bg-slate-700/50'
                  }`}
                  onMouseEnter={() => setHoveredLegend(idx)}
                  onMouseLeave={() => setHoveredLegend(null)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: asset.color }}
                    />
                    <span className="text-sm font-semibold text-gray-900 dark:text-slate-200 truncate">
                      {asset.type}
                      {asset.isGrouped && ` (${asset.groupedCount})`}
                    </span>
                  </div>
                  <div className="text-right ml-4 flex-shrink-0">
                    <div className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                      {formatPercent(asset.percentage)}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-slate-400">
                      {formatCurrency(asset.value)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PortfolioAllocationDonut;

