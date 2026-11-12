import React from 'react';
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react';

const PortfolioSummaryRow = ({ summary }) => {
  if (!summary) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Wallet className="h-6 w-6 text-gray-400" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Portfolio Total</h3>
              <p className="text-sm text-gray-500">Complete overview</p>
            </div>
          </div>
          <div className="flex items-center space-x-8">
            <div className="text-right">
              <p className="text-sm text-gray-500">Cost Basis</p>
              <p className="text-lg font-semibold">$0.00</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Current Value</p>
              <p className="text-lg font-semibold">$0.00</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Gain/Loss</p>
              <p className="text-lg font-semibold text-gray-600">$0.00</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Return %</p>
              <p className="text-lg font-semibold text-gray-600">0.00%</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatPercent = (percent) => {
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(2)}%`;
  };

  const gainLossColor = summary.gainLoss >= 0 ? 'text-emerald-600' : 'text-red-600';
  const returnColor = summary.returnPct >= 0 ? 'text-emerald-600' : 'text-red-600';
  const GainIcon = summary.gainLoss >= 0 ? TrendingUp : TrendingDown;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Wallet className="h-6 w-6 text-blue-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Portfolio Total</h3>
            <p className="text-sm text-gray-500">Complete overview</p>
          </div>
        </div>
        <div className="flex items-center space-x-8">
          <div className="text-right">
            <p className="text-sm text-gray-500">Cost Basis</p>
            <p className="text-lg font-semibold text-gray-900">
              {formatCurrency(summary.costBasis)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Current Value</p>
            <p className="text-lg font-semibold text-gray-900">
              {formatCurrency(summary.currentValue)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Gain/Loss</p>
            <div className="flex items-center justify-end space-x-1">
              <GainIcon className={`h-4 w-4 ${gainLossColor}`} />
              <p className={`text-lg font-semibold ${gainLossColor}`}>
                {formatCurrency(summary.gainLoss)}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Return %</p>
            <p className={`text-lg font-semibold ${returnColor}`}>
              {formatPercent(summary.returnPct)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortfolioSummaryRow;

