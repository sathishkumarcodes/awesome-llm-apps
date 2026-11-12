import React from 'react';

const ContributionChart = ({ data, title = "Monthly Contributions" }) => {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0);
  };

  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <p className="text-sm">No contribution data available</p>
        </div>
      </div>
    );
  }

  // Chart dimensions
  const width = 500;
  const height = 250;
  const margin = { top: 20, right: 30, bottom: 60, left: 50 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Calculate scales
  const amounts = data.map(d => d.amount || 0);
  const maxValue = Math.max(...amounts, 1);
  const minValue = Math.min(...amounts, 0);
  const valueRange = maxValue - minValue;
  const padding = valueRange * 0.1 || 1;

  const xScale = (index) => (index / (data.length - 1)) * chartWidth;
  const yScale = (value) => chartHeight - ((value - minValue + padding) / (valueRange + 2 * padding)) * chartHeight;

  const barWidth = chartWidth / data.length * 0.7;

  // Y-axis ticks
  const yTicks = [];
  const tickCount = 4;
  for (let i = 0; i <= tickCount; i++) {
    const value = minValue + (valueRange * i / tickCount);
    yTicks.push({
      value,
      y: yScale(value)
    });
  }

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold mb-4 text-center">{title}</h3>
      
      <div className="overflow-x-auto">
        <svg width={width} height={height} className="min-w-full">
          {/* Background */}
          <rect width={width} height={height} fill="#fafafa" />
          
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
                />
                <text
                  x={-10}
                  y={tick.y + 4}
                  textAnchor="end"
                  fontSize="12"
                  fill="#6b7280"
                >
                  {formatCurrency(tick.value)}
                </text>
              </g>
            ))}

            {/* Bars */}
            {data.map((item, index) => {
              const x = xScale(index) - barWidth / 2;
              const y = yScale(item.amount);
              const barHeight = chartHeight - y;
              
              return (
                <g key={index}>
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    fill="#3b82f6"
                    rx={4}
                    className="hover:fill-blue-600 transition-colors duration-200"
                  />
                  <text
                    x={xScale(index)}
                    y={y - 5}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#374151"
                    className="font-medium"
                  >
                    {formatCurrency(item.amount)}
                  </text>
                </g>
              );
            })}

            {/* X-axis labels */}
            {data.map((item, index) => (
              <text
                key={index}
                x={xScale(index)}
                y={chartHeight + 20}
                textAnchor="middle"
                fontSize="11"
                fill="#6b7280"
                transform={`rotate(-45, ${xScale(index)}, ${chartHeight + 20})`}
              >
                {item.month}
              </text>
            ))}
          </g>
        </svg>
      </div>
      
      {/* Summary */}
      <div className="mt-4 text-center">
        <div className="text-sm text-gray-600">
          Total Contributions: <span className="font-semibold text-gray-900">
            {formatCurrency(data.reduce((sum, item) => sum + item.amount, 0))}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ContributionChart;