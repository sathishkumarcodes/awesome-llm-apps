import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import PortfolioAllocationDonut from './PortfolioAllocationDonut';

/**
 * AssetAllocationSection - Premium Moona-style asset allocation breakdown
 * 
 * @param {Object} props
 * @param {Array<{name: string, color: string, costBasis: number, currentValue: number, gainLoss: number, gainPct: number, portfolioPct: number}>} props.assets - Array of asset class rows
 * @param {number} props.totalValue - Total portfolio value
 * @param {number} [props.dailyChangePct] - Daily change percentage (e.g., 29.3 for +29.3%)
 * @param {number} [props.dailyChangeValue] - Daily change value in dollars
 */
const AssetAllocationSection = ({ 
  assets = [], 
  totalValue = 0, 
  dailyChangePct, 
  dailyChangeValue 
}) => {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatPercent = (percent, showSign = false) => {
    const sign = showSign ? (percent >= 0 ? '+' : '') : '';
    return `${sign}${percent.toFixed(2)}%`;
  };

  // Calculate totals
  const totals = assets.reduce((acc, asset) => {
    acc.costBasis += asset.costBasis || 0;
    acc.currentValue += asset.currentValue || 0;
    acc.gainLoss += asset.gainLoss || 0;
    return acc;
  }, { costBasis: 0, currentValue: 0, gainLoss: 0 });

  const totalGainPct = totals.costBasis > 0 
    ? ((totals.gainLoss / totals.costBasis) * 100) 
    : 0;

  // Prepare assets for donut chart
  const donutAssets = assets.map(asset => ({
    type: asset.name,
    value: asset.currentValue,
    color: asset.color
  }));

  if (!assets || assets.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="text-center py-12">
          <p className="text-slate-500 text-sm">No assets yet. Add your first holding to see allocation.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
      {/* Donut Chart */}
      <div className="flex justify-center mb-6">
        <PortfolioAllocationDonut
          assets={donutAssets}
          totalValue={totalValue}
          dailyChangePct={dailyChangePct}
          dailyChangeValue={dailyChangeValue}
          showLegend={false}
        />
      </div>

      {/* Asset Breakdown Table */}
      <div className="overflow-x-auto -mx-6 px-6">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                Asset Class
              </th>
              <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                Cost Basis
              </th>
              <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                Current Value
              </th>
              <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                Gain/Loss
              </th>
              <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                % Gain
              </th>
              <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                % of Portfolio
              </th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset, index) => {
              const isPositive = asset.gainLoss >= 0;
              const GainIcon = isPositive ? TrendingUp : TrendingDown;

              return (
                <tr
                  key={asset.name}
                  className={`border-t border-slate-100 hover:bg-slate-50 transition-colors duration-150 ${
                    index === assets.length - 1 ? 'border-b border-slate-200' : ''
                  }`}
                >
                  {/* Asset Class */}
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: asset.color }}
                      />
                      <span className="text-sm font-medium text-slate-900">
                        {asset.name}
                      </span>
                    </div>
                  </td>

                  {/* Cost Basis */}
                  <td className="py-4 px-4 text-right">
                    <span className="text-sm text-slate-900">
                      {formatCurrency(asset.costBasis)}
                    </span>
                  </td>

                  {/* Current Value */}
                  <td className="py-4 px-4 text-right">
                    <span className="text-sm font-medium text-slate-900">
                      {formatCurrency(asset.currentValue)}
                    </span>
                  </td>

                  {/* Gain/Loss */}
                  <td className="py-4 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <GainIcon 
                        className={`h-3.5 w-3.5 flex-shrink-0 ${
                          isPositive 
                            ? 'text-emerald-600' 
                            : 'text-red-600'
                        }`} 
                      />
                      <span className={`text-sm font-medium ${
                        isPositive 
                          ? 'text-emerald-600' 
                          : 'text-red-600'
                      }`}>
                        {formatCurrency(asset.gainLoss)}
                      </span>
                    </div>
                  </td>

                  {/* % Gain */}
                  <td className="py-4 px-4 text-right">
                    <span className={`text-sm font-medium ${
                      isPositive 
                        ? 'text-emerald-600' 
                        : 'text-red-600'
                    }`}>
                      {formatPercent(asset.gainPct, true)}
                    </span>
                  </td>

                  {/* % of Portfolio */}
                  <td className="py-4 px-4 text-right">
                    <span className="text-sm text-slate-700">
                      {formatPercent(asset.portfolioPct)}
                    </span>
                  </td>
                </tr>
              );
            })}

            {/* Total Row */}
            <tr className="border-t-2 border-slate-300 bg-slate-50">
              <td className="py-4 px-4">
                <span className="text-sm font-semibold text-slate-900">Total</span>
              </td>
              <td className="py-4 px-4 text-right">
                <span className="text-sm font-semibold text-slate-900">
                  {formatCurrency(totals.costBasis)}
                </span>
              </td>
              <td className="py-4 px-4 text-right">
                <span className="text-sm font-semibold text-slate-900">
                  {formatCurrency(totals.currentValue)}
                </span>
              </td>
              <td className="py-4 px-4 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  {totals.gainLoss >= 0 ? (
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-red-600" />
                  )}
                  <span className={`text-sm font-semibold ${
                    totals.gainLoss >= 0 
                      ? 'text-emerald-600' 
                      : 'text-red-600'
                  }`}>
                    {formatCurrency(totals.gainLoss)}
                  </span>
                </div>
              </td>
              <td className="py-4 px-4 text-right">
                <span className={`text-sm font-semibold ${
                  totalGainPct >= 0 
                    ? 'text-emerald-600' 
                    : 'text-red-600'
                }`}>
                  {formatPercent(totalGainPct, true)}
                </span>
              </td>
              <td className="py-4 px-4 text-right">
                <span className="text-sm font-semibold text-slate-700">100%</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AssetAllocationSection;


