import React, { useState, useMemo } from 'react';
import { Card, CardContent } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { TrendingUp, AlertTriangle, Target, X } from 'lucide-react';
import { Button } from './ui/button';

const QuickInsightsRow = ({ portfolioSummary, holdings, onNavigateToTab, onFilterHoldings }) => {
  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
  const [showConcentrationModal, setShowConcentrationModal] = useState(false);
  const [showDiversificationModal, setShowDiversificationModal] = useState(false);
  
  // Calculate asset class breakdown for diversification modal (must be before early returns)
  const assetClassBreakdown = useMemo(() => {
    if (!holdings || holdings.length === 0) return [];
    
    const assetClassMap = {};
    let totalValue = 0;

    holdings.forEach(holding => {
      const type = holding.type || holding.asset_type || 'Other';
      const value = holding.total_value || holding.current_value || 0;
      
      if (!assetClassMap[type]) {
        assetClassMap[type] = {
          type,
          value: 0,
          count: 0
        };
      }
      assetClassMap[type].value += value;
      assetClassMap[type].count += 1;
      totalValue += value;
    });

    return Object.values(assetClassMap)
      .map(item => ({
        ...item,
        percentage: totalValue > 0 ? (item.value / totalValue) * 100 : 0
      }))
      .sort((a, b) => b.value - a.value);
  }, [holdings]);

  // NOW we can do early returns after all hooks
  if (!portfolioSummary || !holdings || holdings.length === 0) {
    return null;
  }

  const insights = [];
  let highPerformers = [];
  let top3Holdings = [];
  let top3Percent = 0;
  let assetTypes = new Set();
  let sectors = new Set();

  // Outstanding Returns
  highPerformers = holdings.filter(h => {
    const returnPct = h.return_percent || h.gain_loss_percent || 0;
    return returnPct > 25;
  });
  if (highPerformers.length > 0) {
    insights.push({
      id: 'outstanding-returns',
      icon: TrendingUp,
      color: 'emerald',
      title: 'Outstanding Returns',
      message: `${highPerformers.length} holding${highPerformers.length > 1 ? 's are' : ' is'} up more than 25% this quarter.`,
      onClick: () => {
        if (onNavigateToTab && onFilterHoldings) {
          onNavigateToTab('investments');
          // Filter holdings with return > 25%
          setTimeout(() => {
            onFilterHoldings({ minReturn: 25 });
          }, 100);
        }
      }
    });
  }

  // Concentration Alert
  if (portfolioSummary.currentValue > 0) {
    const sortedHoldings = [...holdings].sort((a, b) => {
      const valA = a.total_value || a.current_value || 0;
      const valB = b.total_value || b.current_value || 0;
      return valB - valA;
    });
    top3Holdings = sortedHoldings.slice(0, 3);
    const top3Value = top3Holdings.reduce((sum, h) => {
      return sum + (h.total_value || h.current_value || 0);
    }, 0);
    top3Percent = (top3Value / portfolioSummary.currentValue) * 100;
    
    if (top3Percent > 40) {
      insights.push({
        id: 'concentration',
        icon: AlertTriangle,
        color: 'amber',
        title: 'Concentration Alert',
        message: `Top 3 holdings = ${top3Percent.toFixed(0)}% of portfolio value.`,
        onClick: () => setShowConcentrationModal(true)
      });
    }
  }

  // Diversification
  assetTypes = new Set(holdings.map(h => h.type || h.asset_type).filter(Boolean));
  sectors = new Set(holdings.map(h => h.sector).filter(Boolean));
  if (assetTypes.size > 0 || sectors.size > 0) {
    insights.push({
      id: 'diversification',
      icon: Target,
      color: 'blue',
      title: 'Diversification',
      message: `You're exposed to ${sectors.size || assetTypes.size} ${sectors.size > 0 ? 'sectors' : 'asset types'} and ${assetTypes.size} asset class${assetTypes.size > 1 ? 'es' : ''}.`,
      onClick: () => {
        if (onNavigateToTab) {
          onNavigateToTab('analytics');
        } else {
          setShowDiversificationModal(true);
        }
      }
    });
  }

  if (insights.length === 0) {
    return null;
  }

  const getColorClasses = (color) => {
    const colors = {
      emerald: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 dark:shadow-[0_0_12px_rgba(16,185,129,0.2)]',
      amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 dark:shadow-[0_0_12px_rgba(245,158,11,0.2)]',
      blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 dark:shadow-[0_0_12px_rgba(59,130,246,0.2)]',
    };
    return colors[color] || colors.blue;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (percent) => {
    return `${percent.toFixed(1)}%`;
  };

  // Render ring chart component
  const renderRingChart = () => {
    if (!assetClassBreakdown || assetClassBreakdown.length === 0) {
      return (
        <div className="h-64 flex items-center justify-center text-gray-500 dark:text-slate-400">
          No asset data available
        </div>
      );
    }

    const size = 300;
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = 100;
    const innerRadius = 60; // For ring chart effect
    const totalValue = assetClassBreakdown.reduce((sum, item) => sum + item.value, 0);

    let cumulativePercentage = 0;

    const segments = assetClassBreakdown.map((item) => {
      const startAngle = (cumulativePercentage / 100) * 360;
      const endAngle = ((cumulativePercentage + item.percentage) / 100) * 360;
      cumulativePercentage += item.percentage;

      const startAngleRad = ((startAngle - 90) * Math.PI) / 180;
      const endAngleRad = ((endAngle - 90) * Math.PI) / 180;
      const midAngleRad = ((startAngle + endAngle) / 2 - 90) * Math.PI / 180;

      // Outer arc
      const x1 = centerX + radius * Math.cos(startAngleRad);
      const y1 = centerY + radius * Math.sin(startAngleRad);
      const x2 = centerX + radius * Math.cos(endAngleRad);
      const y2 = centerY + radius * Math.sin(endAngleRad);

      // Inner arc
      const x3 = centerX + innerRadius * Math.cos(endAngleRad);
      const y3 = centerY + innerRadius * Math.sin(endAngleRad);
      const x4 = centerX + innerRadius * Math.cos(startAngleRad);
      const y4 = centerY + innerRadius * Math.sin(startAngleRad);

      const largeArcFlag = item.percentage > 50 ? 1 : 0;

      // Create ring segment path
      const pathData = [
        `M ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
        `L ${x3} ${y3}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4}`,
        'Z'
      ].join(' ');

      // Label position
      const labelRadius = radius + 20;
      const labelX = centerX + labelRadius * Math.cos(midAngleRad);
      const labelY = centerY + labelRadius * Math.sin(midAngleRad);

      return {
        ...item,
        pathData,
        labelX,
        labelY,
        midAngleRad,
        color: getAssetTypeColor(item.type)
      };
    });

    return (
      <div className="relative">
        <svg width={size} height={size} className="overflow-visible">
          <defs>
            {segments.map((seg, idx) => (
              <filter key={idx} id={`diversification-glow-${idx}`}>
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            ))}
          </defs>
          {segments.map((seg, idx) => (
            <g key={idx}>
              <path
                d={seg.pathData}
                fill={seg.color}
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="2"
                filter={`url(#diversification-glow-${idx})`}
                className="hover:opacity-80 transition-opacity cursor-pointer"
                style={{ opacity: 0.9 }}
              />
              {/* Label */}
              {seg.percentage > 3 && (
                <text
                  x={seg.labelX}
                  y={seg.labelY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-xs font-semibold fill-gray-900 dark:fill-slate-200 pointer-events-none"
                >
                  {seg.type}
                </text>
              )}
            </g>
          ))}
          {/* Center text */}
          <text
            x={centerX}
            y={centerY - 10}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-sm font-bold fill-gray-700 dark:fill-slate-300"
          >
            Total
          </text>
          <text
            x={centerX}
            y={centerY + 10}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-xs fill-gray-600 dark:fill-slate-400"
          >
            {formatCurrency(totalValue)}
          </text>
        </svg>
      </div>
    );
  };

  const getAssetTypeColor = (type) => {
    const normalized = type?.toLowerCase().replace(/\s+/g, '_');
    const colors = {
      'stock': '#059669',
      'stocks': '#059669',
      'crypto': '#dc2626',
      'cryptocurrency': '#dc2626',
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

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {insights.slice(0, 3).map((insight, idx) => {
          const Icon = insight.icon;
          return (
            <Card 
              key={idx} 
              className={`${getColorClasses(insight.color)} border dark:border-[rgba(255,255,255,0.05)] shadow-sm dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] rounded-2xl cursor-pointer hover:shadow-md dark:hover:bg-opacity-80 dark:hover:-translate-y-0.5 transition-all duration-200`}
              onClick={insight.onClick}
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 text-${insight.color}-600 dark:text-${insight.color}-400`} />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold mb-1 dark:text-slate-200">{insight.title}</h4>
                    <p className="text-xs leading-relaxed dark:text-slate-300">{insight.message}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Concentration Modal */}
      <Dialog open={showConcentrationModal} onOpenChange={setShowConcentrationModal}>
        <DialogContent className="max-w-2xl bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  Risk & Concentration
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Your top holdings and concentration metrics
                </DialogDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowConcentrationModal(false)}
                className="h-8 w-8 p-0 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">
                Top 3 Holdings = {formatPercent(top3Percent)} of Portfolio Value
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                High concentration increases risk. Consider diversifying across more holdings to reduce exposure to individual stock volatility.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Top Holdings</h4>
              {top3Holdings.map((holding, idx) => {
                const value = holding.total_value || holding.current_value || 0;
                const weight = portfolioSummary.currentValue > 0 ? (value / portfolioSummary.currentValue) * 100 : 0;
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-200 dark:border-slate-600"
                  >
                    <div>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {holding.symbol}
                      </span>
                      <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">
                        {holding.name || holding.symbol}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {formatCurrency(value)}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {formatPercent(weight)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diversification Modal */}
      <Dialog open={showDiversificationModal} onOpenChange={setShowDiversificationModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#112334] border-gray-200 dark:border-[rgba(255,255,255,0.05)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl font-bold text-gray-900 dark:text-slate-200">
                  Asset Allocation
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                  Your portfolio diversification breakdown by asset class
                </DialogDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDiversificationModal(false)}
                className="h-8 w-8 p-0 rounded-full dark:hover:bg-opacity-80"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Asset Class Breakdown with Pie Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pie/Ring Chart - Grouped by Asset Type */}
              <div className="flex flex-col items-center justify-center">
                <div className="w-full max-w-sm">
                  {renderRingChart()}
                </div>
              </div>

              {/* Asset Class Table */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-200 mb-4">
                  Asset Class Breakdown
                </h3>
                <div className="space-y-2">
                  {assetClassBreakdown.map((assetClass, idx) => {
                    const color = getAssetTypeColor(assetClass.type);
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-200 dark:border-[rgba(255,255,255,0.05)] hover:bg-gray-100 dark:hover:bg-opacity-80 transition-all duration-200"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div
                            className="w-4 h-4 rounded-full flex-shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 dark:text-slate-200 text-sm">
                              {assetClass.type}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-slate-400">
                              {assetClass.count} holding{assetClass.count !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <p className="font-bold text-gray-900 dark:text-slate-200 text-sm">
                            {formatCurrency(assetClass.value)}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-slate-400">
                            {assetClass.percentage.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-[rgba(255,255,255,0.04)]">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">Asset Types</p>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{assetTypes.size}</p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  {Array.from(assetTypes).join(', ') || 'None'}
                </p>
              </div>
              <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
                <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-1">Sectors</p>
                <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">{sectors.size}</p>
                <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1">
                  {sectors.size > 0 ? 'Diversified' : 'Not specified'}
                </p>
              </div>
            </div>

            {/* Recommendation */}
            <div className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-200 dark:border-[rgba(255,255,255,0.05)]">
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-200 mb-2">
                Diversification Recommendation
              </p>
              <p className="text-xs text-gray-700 dark:text-slate-300">
                {assetTypes.size < 3 
                  ? 'Consider diversifying across more asset types (stocks, bonds, crypto, etc.) to reduce risk.'
                  : 'Your portfolio shows good diversification across asset types. Continue monitoring sector concentration.'}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default QuickInsightsRow;

