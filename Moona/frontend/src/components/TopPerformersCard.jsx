import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';

const TopPerformersCard = ({ topPerformers }) => {
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

  if (!topPerformers || topPerformers.length === 0) {
    return (
      <Card className="bg-white/80 dark:bg-[#112334] backdrop-blur-sm border-0 dark:border-[rgba(255,255,255,0.05)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] shadow-sm rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-gray-800 dark:text-slate-200 flex items-center">
            <BarChart3 className="w-4 h-4 mr-2 text-gray-600 dark:text-slate-400" />
            Top Performers
          </CardTitle>
        </CardHeader>
        <CardContent className="p-8">
          <div className="h-48 flex items-center justify-center text-gray-500 dark:text-slate-400 text-sm">
            No performance data yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/80 dark:bg-[#112334] backdrop-blur-sm border-0 dark:border-[rgba(255,255,255,0.05)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] shadow-sm rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-gray-800 dark:text-slate-200 flex items-center">
          <BarChart3 className="w-4 h-4 mr-2 text-gray-600 dark:text-slate-400" />
          Top Performers
        </CardTitle>
      </CardHeader>
      <CardContent className="p-8">
        <div className="space-y-1">
          {/* Header */}
          <div className="grid grid-cols-4 gap-2 text-xs font-semibold text-gray-600 dark:text-slate-400 border-b border-gray-200 dark:border-[rgba(255,255,255,0.04)] pb-2">
            <div>Symbol</div>
            <div>Name</div>
            <div className="text-right">Return %</div>
            <div className="text-right">Value</div>
          </div>

          {/* Rows */}
          {topPerformers.slice(0, 5).map((performer, idx) => {
            const returnPct = performer.return_percent || performer.gain_loss_percent || 0;
            const isPositive = returnPct >= 0;
            const value = performer.total_value || performer.current_value || 0;

            return (
              <div
                key={idx}
                className="grid grid-cols-4 gap-2 py-2 border-b border-gray-100 dark:border-[rgba(255,255,255,0.04)] last:border-0 text-sm hover:bg-gray-50 dark:hover:bg-opacity-80 dark:hover:-translate-y-0.5 rounded transition-all duration-200"
              >
                <div className="font-semibold text-gray-900 dark:text-slate-200">{performer.symbol}</div>
                <div className="text-gray-700 dark:text-slate-300 truncate">{performer.name || performer.symbol}</div>
                <div className={`text-right font-medium flex items-center justify-end gap-1 ${
                  isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {isPositive ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {formatPercent(returnPct)}
                </div>
                <div className="text-right text-gray-700 dark:text-slate-300 font-medium">{formatCurrency(value)}</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default TopPerformersCard;

