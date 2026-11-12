import React from 'react';

const PieChart = ({ data, title, size = 200 }) => {
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = (size - 40) / 2;

  let cumulativePercentage = 0;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Generate path data for each segment
  const segments = data.map((item) => {
    const startAngle = (cumulativePercentage / 100) * 360;
    const endAngle = ((cumulativePercentage + item.percentage) / 100) * 360;
    
    const startAngleRad = ((startAngle - 90) * Math.PI) / 180;
    const endAngleRad = ((endAngle - 90) * Math.PI) / 180;
    
    const x1 = centerX + radius * Math.cos(startAngleRad);
    const y1 = centerY + radius * Math.sin(startAngleRad);
    const x2 = centerX + radius * Math.cos(endAngleRad);
    const y2 = centerY + radius * Math.sin(endAngleRad);
    
    const largeArcFlag = item.percentage > 50 ? 1 : 0;
    
    const pathData = [
      `M ${centerX} ${centerY}`,
      `L ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
      'Z'
    ].join(' ');
    
    cumulativePercentage += item.percentage;
    
    return {
      ...item,
      pathData,
      startAngle,
      endAngle
    };
  });

  return (
    <div className="w-full">
      {title && <h3 className="text-lg font-semibold mb-4 text-center">{title}</h3>}
      
      <div className="flex flex-col lg:flex-row items-center justify-center space-y-4 lg:space-y-0 lg:space-x-8">
        {/* Pie Chart */}
        <div className="relative">
          <svg width={size} height={size} className="drop-shadow-sm">
            {segments.map((segment, index) => (
              <g key={index}>
                <path
                  d={segment.pathData}
                  fill={segment.color}
                  stroke="white"
                  strokeWidth="2"
                  className="hover:opacity-80 transition-opacity duration-200 cursor-pointer"
                />
              </g>
            ))}
          </svg>
        </div>

        {/* Legend */}
        <div className="space-y-3">
          {segments.map((segment, index) => (
            <div key={index} className="flex items-center space-x-3">
              <div
                className="w-4 h-4 rounded-sm flex-shrink-0"
                style={{ backgroundColor: segment.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between space-x-4">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {segment.type || segment.sector}
                  </span>
                  <span className="text-sm text-gray-500 flex-shrink-0">
                    {segment.percentage.toFixed(1)}%
                  </span>
                </div>
                <div className="text-xs text-gray-600">
                  {formatCurrency(segment.value)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PieChart;