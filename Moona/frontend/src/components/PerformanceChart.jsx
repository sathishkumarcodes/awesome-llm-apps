import React, { useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

const PerformanceChart = ({ data, showComparison = false }) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (!data || data.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-3 bg-gray-200 rounded-full flex items-center justify-center">
            <TrendingUp className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-600">No performance data available</p>
          <p className="text-xs text-gray-400 mt-1">Add holdings to see your portfolio performance</p>
        </div>
      </div>
    );
  }

  // Calculate min and max values for scaling
  const allValues = data.flatMap(d => {
    if (showComparison) {
      return [d.portfolio || 0, d.spy || 0];
    }
    return [d.portfolio || d.value || 0];
  });
  const minValue = Math.min(...allValues, 0);
  const maxValue = Math.max(...allValues, 1);
  const valueRange = maxValue - minValue;
  const padding = valueRange * 0.15 || 1;

  // Chart dimensions - responsive
  const width = 1000;
  const height = 400;
  const margin = { top: 30, right: showComparison ? 120 : 60, bottom: 50, left: 80 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Scale functions
  const xScale = (index) => (index / (data.length - 1)) * chartWidth;
  const yScale = (value) => chartHeight - ((value - minValue + padding) / (valueRange + 2 * padding)) * chartHeight;

  // Generate smooth curve path using quadratic bezier
  const generateSmoothPath = (values) => {
    if (values.length === 0) return '';
    if (values.length === 1) {
      const x = xScale(0);
      const y = yScale(values[0]);
      return `M ${x} ${y} L ${x} ${y}`;
    }

    let path = `M ${xScale(0)} ${yScale(values[0])}`;
    
    for (let i = 0; i < values.length - 1; i++) {
      const x1 = xScale(i);
      const y1 = yScale(values[i]);
      const x2 = xScale(i + 1);
      const y2 = yScale(values[i + 1]);
      
      const midX = (x1 + x2) / 2;
      path += ` Q ${x1} ${y1}, ${midX} ${(y1 + y2) / 2}`;
      path += ` T ${x2} ${y2}`;
    }
    
    return path;
  };

  // Generate area path (for gradient fill)
  const generateAreaPath = (values) => {
    const linePath = generateSmoothPath(values);
    const firstX = xScale(0);
    const lastX = xScale(values.length - 1);
    const bottomY = chartHeight;
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  const portfolioValues = data.map(d => d.portfolio || d.value || 0);
  const spyValues = showComparison ? data.map(d => d.spy || 0) : [];
  const portfolioPath = generateSmoothPath(portfolioValues);
  const portfolioAreaPath = generateAreaPath(portfolioValues);
  const spyPath = showComparison ? generateSmoothPath(spyValues) : '';

  // Calculate performance metrics
  const firstValue = portfolioValues[0];
  const lastValue = portfolioValues[portfolioValues.length - 1];
  const totalChange = lastValue - firstValue;
  const totalChangePercent = firstValue > 0 ? (totalChange / firstValue) * 100 : 0;

  // Y-axis ticks
  const yTicks = [];
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    const value = minValue + (valueRange * i / tickCount);
    yTicks.push({
      value,
      y: yScale(value)
    });
  }

  // Find closest point to mouse
  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - margin.left;
    const closestIndex = Math.round((x / chartWidth) * (data.length - 1));
    setHoveredIndex(Math.max(0, Math.min(closestIndex, data.length - 1)));
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  return (
    <div className="w-full">
      {/* Performance Summary */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 p-4 bg-gradient-to-r from-emerald-50 to-blue-50 rounded-lg border border-emerald-100">
        <div>
          <div className="text-xs font-medium text-gray-600 mb-1">Current Value</div>
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(lastValue)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium text-gray-600 mb-1">Total Change</div>
          <div className={`text-xl font-bold flex items-center gap-1 ${totalChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {totalChange >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            {formatCurrency(Math.abs(totalChange))} ({totalChangePercent >= 0 ? '+' : ''}{totalChangePercent.toFixed(2)}%)
          </div>
        </div>
      </div>

      <div className="overflow-x-auto -mx-4 px-4">
        <svg 
          width={width} 
          height={height} 
          className="min-w-full"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            {/* Gradient for portfolio area */}
            <linearGradient id="portfolioGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
            </linearGradient>
            {/* Gradient for portfolio line */}
            <linearGradient id="portfolioLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#059669" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
            {/* Shadow filter */}
            <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
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
          
          {/* Chart area */}
          <g transform={`translate(${margin.left}, ${margin.top})`}>
            {/* Grid lines */}
            {yTicks.map((tick, index) => (
              <g key={index}>
                <line
                  x1={0}
                  y1={tick.y}
                  x2={chartWidth}
                  y2={tick.y}
                  stroke="#e5e7eb"
                  strokeWidth={1}
                  strokeDasharray="2,2"
                  opacity="0.6"
                />
                <text
                  x={-15}
                  y={tick.y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="#6b7280"
                  fontWeight="500"
                >
                  {formatCurrency(tick.value)}
                </text>
              </g>
            ))}

            {/* X-axis line */}
            <line
              x1={0}
              y1={chartHeight}
              x2={chartWidth}
              y2={chartHeight}
              stroke="#d1d5db"
              strokeWidth={2}
            />

            {/* X-axis labels */}
            {data.map((item, index) => {
              const showLabel = index % Math.ceil(data.length / 5) === 0 || index === data.length - 1;
              if (!showLabel) return null;
              return (
                <g key={index}>
                  <line
                    x1={xScale(index)}
                    y1={chartHeight}
                    x2={xScale(index)}
                    y2={chartHeight + 5}
                    stroke="#9ca3af"
                    strokeWidth={1.5}
                  />
                  <text
                    x={xScale(index)}
                    y={chartHeight + 22}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#6b7280"
                    fontWeight="500"
                  >
                    {formatDate(item.date)}
                  </text>
                </g>
              );
            })}

            {/* Portfolio area fill */}
            <path
              d={portfolioAreaPath}
              fill="url(#portfolioGradient)"
            />

            {/* Portfolio line */}
            <path
              d={portfolioPath}
              fill="none"
              stroke="url(#portfolioLineGradient)"
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#shadow)"
            />

            {/* SPY line (if showing comparison) */}
            {showComparison && (
              <path
                d={spyPath}
                fill="none"
                stroke="#f97316"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="6,4"
                opacity="0.8"
              />
            )}

            {/* Hover line */}
            {hoveredIndex !== null && (
              <g>
                <line
                  x1={xScale(hoveredIndex)}
                  y1={0}
                  x2={xScale(hoveredIndex)}
                  y2={chartHeight}
                  stroke="#9ca3af"
                  strokeWidth={1.5}
                  strokeDasharray="4,4"
                  opacity="0.5"
                />
                {/* Tooltip background */}
                <rect
                  x={xScale(hoveredIndex) - 80}
                  y={10}
                  width={160}
                  height={showComparison ? 70 : 50}
                  fill="rgba(0, 0, 0, 0.85)"
                  rx="6"
                />
                {/* Tooltip text */}
                <text
                  x={xScale(hoveredIndex)}
                  y={28}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#9ca3af"
                  fontWeight="500"
                >
                  {formatDate(data[hoveredIndex].date)}
                </text>
                <text
                  x={xScale(hoveredIndex)}
                  y={48}
                  textAnchor="middle"
                  fontSize="13"
                  fill="#10b981"
                  fontWeight="bold"
                >
                  Portfolio: {formatCurrency(portfolioValues[hoveredIndex])}
                </text>
                {showComparison && (
                  <text
                    x={xScale(hoveredIndex)}
                    y={68}
                    textAnchor="middle"
                    fontSize="13"
                    fill="#f97316"
                    fontWeight="bold"
                  >
                    SPY: {formatCurrency(spyValues[hoveredIndex])}
                  </text>
                )}
              </g>
            )}

            {/* Data points (only show on hover) */}
            {hoveredIndex !== null && (
              <>
                <circle
                  cx={xScale(hoveredIndex)}
                  cy={yScale(portfolioValues[hoveredIndex])}
                  r={6}
                  fill="#10b981"
                  stroke="white"
                  strokeWidth={3}
                  filter="url(#shadow)"
                />
                {showComparison && (
                  <circle
                    cx={xScale(hoveredIndex)}
                    cy={yScale(spyValues[hoveredIndex])}
                    r={5}
                    fill="#f97316"
                    stroke="white"
                    strokeWidth={3}
                    filter="url(#shadow)"
                  />
                )}
              </>
            )}
          </g>

          {/* Legend */}
          {showComparison && (
            <g transform={`translate(${width - margin.right + 10}, ${margin.top + 20})`}>
              <rect
                x={0}
                y={0}
                width={110}
                height={60}
                fill="white"
                stroke="#e5e7eb"
                strokeWidth={1}
                rx="6"
                opacity="0.95"
              />
              <g transform="translate(10, 15)">
                <line x1={0} y1={0} x2={20} y2={0} stroke="#10b981" strokeWidth={3.5} />
                <text x={25} y={4} fontSize="12" fill="#374151" fontWeight="600">Your Portfolio</text>
              </g>
              <g transform="translate(10, 40)">
                <line x1={0} y1={0} x2={20} y2={0} stroke="#f97316" strokeWidth={2.5} strokeDasharray="6,4" />
                <text x={25} y={4} fontSize="12" fill="#374151" fontWeight="600">SPY (S&P 500)</text>
              </g>
            </g>
          )}
        </svg>
      </div>
      
      {/* Current values display */}
      <div className="mt-6 flex justify-center gap-8 text-sm">
        <div className="text-center px-4 py-2 bg-emerald-50 rounded-lg border border-emerald-200">
          <div className="text-xs font-medium text-emerald-700 mb-1">Your Portfolio</div>
          <div className="text-lg font-bold text-emerald-900">
            {formatCurrency(lastValue)}
          </div>
        </div>
        {showComparison && (
          <div className="text-center px-4 py-2 bg-orange-50 rounded-lg border border-orange-200">
            <div className="text-xs font-medium text-orange-700 mb-1">SPY (S&P 500)</div>
            <div className="text-lg font-bold text-orange-900">
              {formatCurrency(spyValues[spyValues.length - 1] || 0)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PerformanceChart;