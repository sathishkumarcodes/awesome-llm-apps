import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { TrendingUp, TrendingDown, Target, BarChart3 } from 'lucide-react';
import PerformanceChart from './PerformanceChart';

const SPYComparison = ({ comparison, performanceData }) => {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatPercent = (percent) => {
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(2)}%`;
  };

  const getChangeColor = (value) => {
    return value >= 0 ? 'text-emerald-600' : 'text-red-600';
  };

  const getChangeBgColor = (value) => {
    return value >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200';
  };

  const outperformanceColor = comparison.outperformance >= 0 ? 'emerald' : 'red';

  return (
    <div className="space-y-6">
      {/* Comparison Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Your Portfolio</CardTitle>
            <BarChart3 className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(comparison.portfolioValue)}
            </div>
            <div className="flex items-center space-x-2 mt-2">
              <Badge variant="outline" className={getChangeBgColor(comparison.portfolioReturnPct)}>
                <span className={getChangeColor(comparison.portfolioReturnPct)}>
                  {formatPercent(comparison.portfolioReturnPct)}
                </span>
              </Badge>
              <span className="text-sm text-gray-600">return</span>
            </div>
            <div className="text-sm text-gray-500 mt-1">
              Invested: {formatCurrency(comparison.portfolioInvested || comparison.portfolioValue / (1 + comparison.portfolioReturnPct / 100))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">SPY (S&P 500)</CardTitle>
            <Target className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(comparison.spyValue)}
            </div>
            <div className="flex items-center space-x-2 mt-2">
              <Badge variant="outline" className={getChangeBgColor(comparison.spyReturn)}>
                <span className={getChangeColor(comparison.spyReturn)}>
                  {formatPercent(comparison.spyReturn)}
                </span>
              </Badge>
              <span className="text-sm text-gray-600">return</span>
            </div>
            <div className="text-sm text-gray-500 mt-1">
              Invested: {formatCurrency(comparison.spyInvested || (comparison.spyValue / (1 + (comparison.spyReturnPct || 0) / 100)))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Outperformance</CardTitle>
            {comparison.outperformance >= 0 ? (
              <TrendingUp className={`h-4 w-4 text-${outperformanceColor}-600`} />
            ) : (
              <TrendingDown className={`h-4 w-4 text-${outperformanceColor}-600`} />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold text-${outperformanceColor}-600`}>
              {formatPercent(comparison.outperformance)}
            </div>
            <div className={`text-lg font-semibold text-${outperformanceColor}-600 mt-1`}>
              {formatCurrency(comparison.absoluteDifference)}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {comparison.outperformance >= 0 ? 'better than' : 'behind'} SPY
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Portfolio vs SPY Performance</CardTitle>
          <p className="text-sm text-gray-600">
            Comparison of your portfolio performance against the S&P 500 index over time
          </p>
        </CardHeader>
        <CardContent>
          <PerformanceChart data={performanceData} showComparison={true} />
        </CardContent>
      </Card>

      {/* Detailed Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-900">Key Metrics</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Initial Investment:</span>
                    <span className="text-sm font-medium">{formatCurrency(comparison.portfolioInvested)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Portfolio Value:</span>
                    <span className="text-sm font-medium">{formatCurrency(comparison.portfolioValue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">SPY Value:</span>
                    <span className="text-sm font-medium">{formatCurrency(comparison.spyValue)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-sm text-gray-600">Difference:</span>
                    <span className={`text-sm font-semibold text-${outperformanceColor}-600`}>
                      {formatCurrency(comparison.absoluteDifference)}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-900">Investment Insights</h4>
                <div className="text-sm text-gray-600 space-y-2">
                  {comparison.outperformance >= 0 ? (
                    <div>
                      <p className="text-emerald-600 font-medium">🎉 Great job!</p>
                      <p>Your portfolio is outperforming the S&P 500 by {formatPercent(comparison.outperformance)}. 
                      This suggests your investment strategy and stock selection are working well.</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-amber-600 font-medium">📊 Room for improvement</p>
                      <p>Your portfolio is underperforming the S&P 500 by {formatPercent(Math.abs(comparison.outperformance))}. 
                      Consider reviewing your investment strategy or diversifying further.</p>
                    </div>
                  )}
                  <p className="mt-3">
                    The S&P 500 (SPY) serves as a broad market benchmark. Consistently outperforming it is challenging, 
                    and many professional fund managers struggle to beat this index over the long term.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SPYComparison;