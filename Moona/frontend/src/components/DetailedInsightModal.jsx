import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { X, TrendingUp, TrendingDown, AlertTriangle, BarChart3 } from 'lucide-react';

const DetailedInsightModal = ({ open, onClose, insight }) => {
  if (!insight) return null;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (value) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const isPositive = insight.changePct >= 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#112334] border-gray-200 dark:border-[rgba(255,255,255,0.05)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Detailed Portfolio Analysis
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Comprehensive breakdown of today's portfolio performance
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Summary Card */}
          <div className={`p-4 rounded-lg border-2 ${
            isPositive 
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' 
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Today's Change</p>
                <p className={`text-3xl font-bold mt-1 ${
                  isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {formatPercent(insight.changePct)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Value Change</p>
                <p className={`text-2xl font-bold mt-1 ${
                  isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {formatCurrency(insight.changeValue)}
                </p>
              </div>
            </div>
          </div>

          {/* Main Insight */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Insight</h3>
            <p className="text-base font-semibold text-gray-800 dark:text-gray-200">
              {insight.headline}
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {insight.details}
            </p>
          </div>

          {/* Key Drivers */}
          {insight.keyDrivers && insight.keyDrivers.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
                <BarChart3 className="w-5 h-5 mr-2" />
                Key Drivers
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {insight.keyDrivers.map((driver, idx) => {
                  const isPositiveDriver = driver.includes('+') || driver.includes('up');
                  const parts = driver.split(':');
                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border ${
                        isPositiveDriver
                          ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                          : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {isPositiveDriver ? (
                          <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                        )}
                        <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                          {parts[0]?.trim()}
                        </span>
                      </div>
                      <p className={`text-sm font-medium ${
                        isPositiveDriver 
                          ? 'text-emerald-700 dark:text-emerald-300' 
                          : 'text-red-700 dark:text-red-300'
                      }`}>
                        {parts[1]?.trim() || driver}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Attribution Details */}
          {insight.attribution && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Attribution Breakdown</h3>
              
              {/* Top Gainers */}
              {insight.attribution.topGainers && insight.attribution.topGainers.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 mb-2 flex items-center">
                    <TrendingUp className="w-4 h-4 mr-1" />
                    Top Gainers
                  </h4>
                  <div className="space-y-2">
                    {insight.attribution.topGainers.slice(0, 5).map((gainer, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800"
                      >
                        <div>
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {gainer.symbol}
                          </span>
                          <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">
                            {gainer.name}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatPercent(gainer.priceChangePct)}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {formatCurrency(gainer.impactValue)} impact
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Losers */}
              {insight.attribution.topLosers && insight.attribution.topLosers.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-red-700 dark:text-red-300 mb-2 flex items-center">
                    <TrendingDown className="w-4 h-4 mr-1" />
                    Top Losers
                  </h4>
                  <div className="space-y-2">
                    {insight.attribution.topLosers.slice(0, 5).map((loser, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800"
                      >
                        <div>
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {loser.symbol}
                          </span>
                          <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">
                            {loser.name}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                            {formatPercent(loser.priceChangePct)}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {formatCurrency(loser.impactValue)} impact
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Concentration Metrics */}
              {insight.attribution.concentration && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-3 flex items-center">
                    <AlertTriangle className="w-4 h-4 mr-1" />
                    Concentration Risk
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Top Holding</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                        {insight.attribution.concentration.topHoldingPct?.toFixed(1) || 0}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Top 3 Holdings</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                        {insight.attribution.concentration.top3Pct?.toFixed(1) || 0}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Top Sector</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                        {insight.attribution.concentration.topSectorPct?.toFixed(1) || 0}%
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Close Button */}
          <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-slate-700">
            <Button
              onClick={onClose}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DetailedInsightModal;

