import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

const PortfolioPieChart = ({ holdings }) => {
  // Initialize with all available asset types from holdings, or default set
  const getInitialAssetTypes = () => {
    if (!holdings || holdings.length === 0) {
      return new Set(['stock', 'crypto', 'cash', 'hysa', 'bank', 'home_equity', 'roth_ira', 'etf', 'bond', '401k', '529', 'child_roth', 'hsa', 'traditional_ira', 'sep_ira', 'other']);
    }
    const types = new Set();
    holdings.forEach(h => {
      const type = (h.type || 'other').toLowerCase();
      // Normalize type variations to match getAvailableAssetTypes
      const normalizedType = type === 'cryptocurrency' ? 'crypto' : 
                            type === 'stocks' ? 'stock' : 
                            type === 'roth ira' ? 'roth_ira' : type;
      types.add(normalizedType);
      // Also add original if different (for backward compatibility)
      if (normalizedType !== type) {
        types.add(type);
      }
    });
    // If no types found, use defaults
    return types.size > 0 ? types : new Set(['stock', 'crypto', 'cash', 'hysa', 'bank', 'home_equity', 'roth_ira', 'etf', 'bond', '401k', '529', 'child_roth', 'hsa', 'traditional_ira', 'sep_ira', 'other']);
  };
  
  const [selectedAssetTypes, setSelectedAssetTypes] = useState(() => getInitialAssetTypes());
  const [selectedSegment, setSelectedSegment] = useState(null);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Get asset type color scheme
  const getAssetTypeColor = (assetType) => {
    const normalized = assetType?.toLowerCase().replace(/\s+/g, '_');
    const colors = {
      'stock': '#059669',
      'stocks': '#059669',
      'crypto': '#dc2626',
      'cryptocurrency': '#dc2626',
      'cash': '#FACC15',
      'hysa': '#FACC15',
      'bank': '#FACC15',
      'home_equity': '#A78BFA',
      'home equity': '#A78BFA',
      'roth_ira': '#7c3aed',
      'roth ira': '#7c3aed',
      'etf': '#3b82f6',
      'bond': '#f59e0b',
      '401k': '#10b981',
      '529': '#06b6d4',
      'child_roth': '#a855f7',
      'childs_roth': '#a855f7',
      'hsa': '#f97316',
      'traditional_ira': '#6366f1',
      'sep_ira': '#8b5cf6',
      'other': '#6b7280'
    };
    return colors[normalized] || colors['other'];
  };

  // Generate unique colors for all holdings (not grouped by asset type)
  const getHoldingColor = (symbol) => {
    // Large vibrant color palette for all holdings
    const allColors = [
      // Greens
      '#10b981', '#059669', '#047857', '#34d399', '#6ee7b7', '#14b8a6', '#0d9488',
      // Blues
      '#3b82f6', '#2563eb', '#1d4ed8', '#6366f1', '#4f46e5', '#06b6d4', '#0891b2', '#0284c7', '#0ea5e9',
      // Purples
      '#8b5cf6', '#7c3aed', '#6d28d9', '#a855f7', '#9333ea', '#818cf8', '#a78bfa',
      // Pinks & Reds
      '#ec4899', '#db2777', '#be185d', '#f472b6', '#f43f5e', '#ef4444', '#dc2626', '#b91c1c', '#f87171', '#fb7185',
      // Oranges & Yellows
      '#f97316', '#fb923c', '#f59e0b', '#eab308', '#fbbf24', '#facc15', '#fde047', '#d97706', '#b45309',
      // Teals & Cyans
      '#14b8a6', '#06b6d4', '#0891b2', '#0d9488', '#22c55e', '#16a34a',
      // More vibrant colors
      '#e11d48', '#f43f5e', '#be123c', '#9f1239', '#881337',
      '#7c2d12', '#9a3412', '#c2410c', '#ea580c', '#f97316',
      '#166534', '#15803d', '#16a34a', '#22c55e', '#4ade80',
      '#1e40af', '#1e3a8a', '#1d4ed8', '#2563eb', '#3b82f6',
      '#581c87', '#6b21a8', '#7c3aed', '#8b5cf6', '#a855f7',
      '#be185d', '#9f1239', '#be123c', '#db2777', '#ec4899'
    ];
    
    // Use symbol hash for consistent color assignment
    let hash = 0;
    for (let i = 0; i < symbol.length; i++) {
      hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
    }
    return allColors[Math.abs(hash) % allColors.length];
  };

  // Get all available asset types
  const getAvailableAssetTypes = () => {
    if (!holdings || holdings.length === 0) return [];
    const types = new Set();
    holdings.forEach(h => {
      const type = (h.type || 'other').toLowerCase();
      // Normalize type variations
      const normalizedType = type === 'cryptocurrency' ? 'crypto' : 
                            type === 'stocks' ? 'stock' : 
                            type === 'roth ira' ? 'roth_ira' : type;
      types.add(normalizedType);
      // Also keep original in case it's different
      if (normalizedType !== type) {
        types.add(type);
      }
    });
    return Array.from(types).sort();
  };

  const availableAssetTypes = getAvailableAssetTypes();
  
  // Update selected types when holdings change to include all available types
  useEffect(() => {
    if (availableAssetTypes.length > 0) {
      setSelectedAssetTypes(prev => {
        const newSet = new Set(prev);
        // Add any new asset types that appear in holdings
        availableAssetTypes.forEach(type => {
          newSet.add(type);
        });
        return newSet;
      });
    }
  }, [availableAssetTypes.join(',')]);

  const toggleAssetType = (assetType) => {
    setSelectedAssetTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(assetType)) {
        newSet.delete(assetType);
      } else {
        newSet.add(assetType);
      }
      return newSet;
    });
  };

  // Calculate portfolio percentage for each holding
  const calculatePortfolioData = () => {
    if (!holdings || holdings.length === 0) return [];

    // Filter by selected asset types
    const filteredHoldings = holdings.filter(h => {
      const type = (h.type || 'other').toLowerCase();
      // Normalize type variations
      const normalizedType = type === 'cryptocurrency' ? 'crypto' : 
                            type === 'stocks' ? 'stock' : 
                            type === 'roth ira' ? 'roth_ira' : type;
      return selectedAssetTypes.has(normalizedType) || selectedAssetTypes.has(type);
    });

    if (filteredHoldings.length === 0) return [];

    const totalValue = filteredHoldings.reduce((sum, h) => sum + (h.total_value || 0), 0);
    if (totalValue === 0) return [];
    
    // Debug logging
    console.log('PortfolioPieChart - Filtered holdings:', filteredHoldings.length);
    console.log('PortfolioPieChart - Selected asset types:', Array.from(selectedAssetTypes));
    console.log('PortfolioPieChart - Total value:', totalValue);

    return filteredHoldings
      .map((holding) => {
        const value = holding.total_value || 0;
        const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0;
        const symbol = holding.symbol || 'N/A';
        const assetType = (holding.type || 'other').toLowerCase();

        return {
          symbol,
          name: holding.name || symbol,
          value,
          percentage,
          assetType,
          color: getHoldingColor(symbol)
        };
      })
      .filter(item => item.percentage > 0) // Only show holdings with value
      .sort((a, b) => b.percentage - a.percentage); // Sort by percentage
  };

  const portfolioData = calculatePortfolioData();

  if (!holdings || holdings.length === 0) {
    return (
      <div className="h-96 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full flex items-center justify-center shadow-lg">
            <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700">No holdings data available</p>
          <p className="text-xs text-gray-500 mt-1">Add holdings to see portfolio breakdown</p>
        </div>
      </div>
    );
  }

  if (portfolioData.length === 0) {
    return (
      <div className="h-96 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full flex items-center justify-center shadow-lg">
            <X className="w-8 h-8 text-gray-500" />
          </div>
          <p className="text-sm font-medium text-gray-700">No holdings match selected filters</p>
          <p className="text-xs text-gray-500 mt-1">Try selecting different asset types</p>
        </div>
      </div>
    );
  }

  // Chart dimensions - larger to utilize more space
  const size = 600;
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = 220;
  const labelDistance = 260; // Distance from center to label connection point
  const labelSpacing = 28; // Minimum vertical spacing between labels

  let cumulativePercentage = 0;

  // Generate segments with label positions
  // Handle single asset case - make it a full circle
  const segments = portfolioData.map((item) => {
    let startAngle, endAngle;
    
    if (portfolioData.length === 1) {
      // Single asset: full circle
      startAngle = 0;
      endAngle = 360;
    } else {
      startAngle = (cumulativePercentage / 100) * 360;
      endAngle = ((cumulativePercentage + item.percentage) / 100) * 360;
    }
    
    const midAngle = (startAngle + endAngle) / 2;
    
    const startAngleRad = ((startAngle - 90) * Math.PI) / 180;
    const endAngleRad = ((endAngle - 90) * Math.PI) / 180;
    const midAngleRad = ((midAngle - 90) * Math.PI) / 180;
    
    // Pie slice path
    const x1 = centerX + radius * Math.cos(startAngleRad);
    const y1 = centerY + radius * Math.sin(startAngleRad);
    const x2 = centerX + radius * Math.cos(endAngleRad);
    const y2 = centerY + radius * Math.sin(endAngleRad);
    
    // For single asset (full circle), use large arc flag
    const largeArcFlag = portfolioData.length === 1 ? 1 : (item.percentage > 50 ? 1 : 0);
    
    const pathData = [
      `M ${centerX} ${centerY}`,
      `L ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
      'Z'
    ].join(' ');

    // Label connection point on pie edge
    const labelX = centerX + labelDistance * Math.cos(midAngleRad);
    const labelY = centerY + labelDistance * Math.sin(midAngleRad);

    // Determine if label should be on left or right
    const isLeft = labelX < centerX;
    
    // Label position (further out for more space)
    const labelOffsetX = isLeft ? -140 : 140;
    const labelPosX = labelX + labelOffsetX;
    const labelPosY = labelY;

    cumulativePercentage += item.percentage;
    
    return {
      ...item,
      pathData,
      startAngle,
      endAngle,
      midAngle,
      labelX,
      labelY,
      labelPosX,
      labelPosY,
      isLeft
    };
  });

  // Split labels into left and right initially
  let leftLabels = segments.filter(s => s.isLeft).sort((a, b) => a.labelPosY - b.labelPosY);
  let rightLabels = segments.filter(s => !s.isLeft).sort((a, b) => a.labelPosY - b.labelPosY);
  
  // Balance distribution between left and right sides
  const balanceLabelDistribution = () => {
    const totalLabels = segments.length;
    const targetPerSide = Math.ceil(totalLabels / 2);
    const leftCount = leftLabels.length;
    const rightCount = rightLabels.length;
    
    // If distribution is already balanced (difference <= 1), return early
    if (Math.abs(leftCount - rightCount) <= 1) {
      return;
    }
    
    // Determine which side needs more labels
    if (leftCount > rightCount) {
      // Move labels from left to right
      const labelsToMove = leftCount - targetPerSide;
      // Sort left labels by distance from center (closest to center first)
      const sortedByDistance = [...leftLabels].sort((a, b) => {
        const distA = Math.abs(a.labelX - centerX);
        const distB = Math.abs(b.labelX - centerX);
        return distA - distB;
      });
      
      // Move the labels closest to center to the right side
      const labelsMoving = sortedByDistance.slice(0, labelsToMove);
      const labelsStaying = sortedByDistance.slice(labelsToMove);
      
      // Update isLeft property for moved labels
      labelsMoving.forEach(label => {
        label.isLeft = false;
        label.labelOffsetX = 140; // Right side offset
        label.labelPosX = label.labelX + 140;
      });
      
      // Re-sort both sides
      leftLabels = labelsStaying.sort((a, b) => a.labelPosY - b.labelPosY);
      rightLabels = [...rightLabels, ...labelsMoving].sort((a, b) => a.labelPosY - b.labelPosY);
    } else {
      // Move labels from right to left
      const labelsToMove = rightCount - targetPerSide;
      // Sort right labels by distance from center (closest to center first)
      const sortedByDistance = [...rightLabels].sort((a, b) => {
        const distA = Math.abs(a.labelX - centerX);
        const distB = Math.abs(b.labelX - centerX);
        return distA - distB;
      });
      
      // Move the labels closest to center to the left side
      const labelsMoving = sortedByDistance.slice(0, labelsToMove);
      const labelsStaying = sortedByDistance.slice(labelsToMove);
      
      // Update isLeft property for moved labels
      labelsMoving.forEach(label => {
        label.isLeft = true;
        label.labelOffsetX = -140; // Left side offset
        label.labelPosX = label.labelX - 140;
      });
      
      // Re-sort both sides
      rightLabels = labelsStaying.sort((a, b) => a.labelPosY - b.labelPosY);
      leftLabels = [...leftLabels, ...labelsMoving].sort((a, b) => a.labelPosY - b.labelPosY);
    }
  };
  
  // Apply balancing
  balanceLabelDistribution();

  // Adjust label positions to prevent crowding with better spacing
  const adjustLabelPositions = (labels) => {
    if (labels.length === 0) return labels;
    
    const adjusted = [...labels];
    const minSpacing = labelSpacing;
    
    // Start from the first label
    adjusted[0].adjustedY = adjusted[0].labelPosY;
    
    for (let i = 1; i < adjusted.length; i++) {
      const prevY = adjusted[i - 1].adjustedY;
      const currentY = adjusted[i].labelPosY;
      const spacing = currentY - prevY;
      
      if (spacing < minSpacing) {
        // Ensure minimum spacing
        adjusted[i].adjustedY = prevY + minSpacing;
      } else {
        // Keep original position if spacing is adequate
        adjusted[i].adjustedY = currentY;
      }
    }
    
    return adjusted;
  };

  const adjustedLeftLabels = adjustLabelPositions(leftLabels);
  const adjustedRightLabels = adjustLabelPositions(rightLabels);

  const formatAssetTypeName = (type) => {
    const names = {
      'stock': 'Stocks',
      'stocks': 'Stocks',
      'crypto': 'Crypto',
      'cryptocurrency': 'Crypto',
      'cash': 'Cash',
      'hysa': 'HYSA',
      'bank': 'Bank Account',
      'home_equity': 'Home Equity',
      'home equity': 'Home Equity',
      'roth_ira': 'Roth IRA',
      'roth ira': 'Roth IRA',
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
    if (names[normalized]) {
      return names[normalized];
    }
    // Format custom types nicely (e.g., "child_roth" -> "Child Roth")
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="w-full">
      {/* Filter Section */}
      <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 rounded-xl border border-purple-100 shadow-sm">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <h4 className="text-sm font-semibold text-gray-700">Filter by Asset Type</h4>
          {selectedAssetTypes.size < availableAssetTypes.length && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedAssetTypes(new Set(availableAssetTypes))}
              className="text-xs h-7 hover:bg-white/50"
            >
              Show All
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {availableAssetTypes.map((type) => {
            // Normalize the asset type for comparison
            const normalizedType = type === 'cryptocurrency' ? 'crypto' : 
                                   type === 'stocks' ? 'stock' : 
                                   type === 'roth ira' ? 'roth_ira' : type;
            // Check if either the original or normalized type is selected
            const isSelected = selectedAssetTypes.has(type) || selectedAssetTypes.has(normalizedType);
            return (
              <Badge
                key={type}
                variant={isSelected ? "default" : "outline"}
                className={`cursor-pointer transition-all text-xs font-medium ${
                  isSelected 
                    ? 'text-white shadow-md hover:shadow-lg' 
                    : 'bg-white/50 text-gray-600 border-gray-300 hover:bg-white'
                }`}
                style={isSelected ? { 
                  backgroundColor: getAssetTypeColor(type),
                  borderColor: getAssetTypeColor(type)
                } : {}}
                onClick={() => {
                  // Toggle both the original and normalized type to ensure consistency
                  toggleAssetType(type);
                  if (normalizedType !== type) {
                    toggleAssetType(normalizedType);
                  }
                }}
              >
                {formatAssetTypeName(type)}
                {!isSelected && <X className="w-3 h-3 ml-1" />}
              </Badge>
            );
          })}
        </div>
      </div>

      <div className="relative bg-white rounded-2xl p-6 shadow-xl border border-gray-100 overflow-visible w-full" style={{ minHeight: '700px' }}>
        <div className="flex items-center justify-center w-full">
          <svg width={size} height={size} className="drop-shadow-2xl flex-shrink-0">
          {/* Pie slices */}
          {segments.map((segment, index) => {
            const isSelected = selectedSegment === segment.symbol;
            return (
              <g key={index}>
                <path
                  d={segment.pathData}
                  fill={segment.color}
                  stroke={isSelected ? "#1e40af" : "white"}
                  strokeWidth={isSelected ? "5" : "3"}
                  className="hover:opacity-90 hover:brightness-110 transition-all duration-200 cursor-pointer"
                  style={{ 
                    filter: isSelected ? 'drop-shadow(0 4px 8px rgba(30, 64, 175, 0.4)) brightness(1.2)' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))',
                    opacity: isSelected ? 1 : (selectedSegment && selectedSegment !== segment.symbol ? 0.5 : 1)
                  }}
                  onClick={() => setSelectedSegment(isSelected ? null : segment.symbol)}
                />
                
                {/* Connecting line from pie to label - adjusted for balanced distribution */}
                <line
                  x1={segment.labelX}
                  y1={segment.labelY}
                  x2={segment.isLeft ? segment.labelX - 140 : segment.labelX + 140}
                  y2={segment.labelPosY}
                  stroke={isSelected ? "#3b82f6" : "#cbd5e1"}
                  strokeWidth={isSelected ? "2.5" : "1.5"}
                  strokeDasharray={isSelected ? "0" : "3,3"}
                  opacity={isSelected ? "0.8" : "0.4"}
                  className="transition-all duration-200"
                />
                
                {/* Connection point on pie */}
                <circle
                  cx={segment.labelX}
                  cy={segment.labelY}
                  r={isSelected ? "6" : "4"}
                  fill={segment.color}
                  stroke={isSelected ? "#1e40af" : "white"}
                  strokeWidth={isSelected ? "3" : "2"}
                  opacity={isSelected ? 1 : 0.9}
                  className="transition-all duration-200"
                />
              </g>
            );
          })}
        </svg>
        </div>

        {/* Labels - Left side */}
        <div className="absolute left-0 top-0 h-full flex flex-col justify-center" style={{ width: '220px', paddingLeft: '12px' }}>
          {adjustedLeftLabels.map((segment, index) => {
            const displayY = segment.adjustedY || segment.labelPosY;
            const totalHeight = size;
            const normalizedY = ((displayY / totalHeight) * 100);
            const isSelected = selectedSegment === segment.symbol;
            
            return (
              <div
                key={index}
                className="flex items-center justify-end group absolute"
                style={{
                  left: '0',
                  top: `${normalizedY}%`,
                  transform: 'translateY(-50%)',
                  width: '100%',
                  maxWidth: '220px',
                  padding: '2px 0',
                  zIndex: isSelected ? 50 : 10
                }}
                onClick={() => setSelectedSegment(isSelected ? null : segment.symbol)}
              >
                <div 
                  className={`text-right pr-3 backdrop-blur-sm rounded-lg px-3 py-2.5 shadow-sm group-hover:shadow-xl transition-all duration-200 flex-shrink min-w-0 relative cursor-pointer ${
                    isSelected 
                      ? 'bg-blue-50 border-2 border-blue-500 shadow-lg scale-105' 
                      : 'bg-white/95 border border-gray-200 group-hover:bg-white group-hover:border-gray-300'
                  }`}
                  style={{ zIndex: isSelected ? 50 : 10 }}
                  onMouseEnter={(e) => !isSelected && (e.currentTarget.style.zIndex = '50')}
                  onMouseLeave={(e) => !isSelected && (e.currentTarget.style.zIndex = '10')}
                >
                  <div className="flex items-center justify-end gap-2 flex-wrap">
                    <div className={`text-sm font-bold leading-tight break-words max-w-[120px] ${
                      isSelected ? 'text-blue-900' : 'text-gray-900'
                    }`} style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                      {segment.symbol}
                    </div>
                    <div className={`text-xs font-semibold px-1.5 py-0.5 rounded inline-block flex-shrink-0 ${
                      isSelected 
                        ? 'bg-blue-200 text-blue-900' 
                        : 'text-gray-700 bg-gray-100 group-hover:bg-gray-200'
                    }`}>{segment.percentage.toFixed(1)}%</div>
                  </div>
                </div>
                <div
                  className={`rounded-lg flex-shrink-0 border-2 shadow-md group-hover:scale-110 group-hover:shadow-lg transition-all duration-200 ml-2 relative ${
                    isSelected ? 'w-6 h-6 border-blue-500 scale-110 shadow-lg' : 'w-5 h-5 border-white'
                  }`}
                  style={{ backgroundColor: segment.color, zIndex: 20 }}
                />
              </div>
            );
          })}
        </div>

        {/* Labels - Right side */}
        <div className="absolute right-0 top-0 h-full flex flex-col justify-center" style={{ width: '220px', paddingRight: '12px' }}>
          {adjustedRightLabels.map((segment, index) => {
            const displayY = segment.adjustedY || segment.labelPosY;
            const totalHeight = size;
            const normalizedY = ((displayY / totalHeight) * 100);
            const isSelected = selectedSegment === segment.symbol;
            
            return (
              <div
                key={index}
                className="flex items-center justify-start group absolute"
                style={{
                  right: '0',
                  top: `${normalizedY}%`,
                  transform: 'translateY(-50%)',
                  width: '100%',
                  maxWidth: '220px',
                  padding: '2px 0',
                  zIndex: isSelected ? 50 : 10
                }}
                onClick={() => setSelectedSegment(isSelected ? null : segment.symbol)}
              >
                <div
                  className={`rounded-lg flex-shrink-0 border-2 shadow-md group-hover:scale-110 group-hover:shadow-lg transition-all duration-200 mr-2 relative ${
                    isSelected ? 'w-6 h-6 border-blue-500 scale-110 shadow-lg' : 'w-5 h-5 border-white'
                  }`}
                  style={{ backgroundColor: segment.color, zIndex: 20 }}
                />
                <div 
                  className={`text-left backdrop-blur-sm rounded-lg px-3 py-2.5 shadow-sm group-hover:shadow-xl transition-all duration-200 flex-shrink min-w-0 relative cursor-pointer ${
                    isSelected 
                      ? 'bg-blue-50 border-2 border-blue-500 shadow-lg scale-105' 
                      : 'bg-white/95 border border-gray-200 group-hover:bg-white group-hover:border-gray-300'
                  }`}
                  style={{ zIndex: isSelected ? 50 : 10 }}
                  onMouseEnter={(e) => !isSelected && (e.currentTarget.style.zIndex = '50')}
                  onMouseLeave={(e) => !isSelected && (e.currentTarget.style.zIndex = '10')}
                >
                  <div className="flex items-center justify-start gap-2 flex-wrap">
                    <div className={`text-sm font-bold leading-tight break-words max-w-[120px] ${
                      isSelected ? 'text-blue-900' : 'text-gray-900'
                    }`} style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                      {segment.symbol}
                    </div>
                    <div className={`text-xs font-semibold px-1.5 py-0.5 rounded inline-block flex-shrink-0 ${
                      isSelected 
                        ? 'bg-blue-200 text-blue-900' 
                        : 'text-gray-700 bg-gray-100 group-hover:bg-gray-200'
                    }`}>{segment.percentage.toFixed(1)}%</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      <div className="mt-6 text-center">
        <div className="inline-block px-6 py-3 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-200 shadow-md">
          <div className="text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide">Total Portfolio Value</div>
          <div className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
            {formatCurrency(portfolioData.reduce((sum, h) => sum + h.value, 0))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortfolioPieChart;

