import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Slider } from './ui/slider';
import { TrendingUp, TrendingDown, BarChart3, DollarSign, AlertCircle, X } from 'lucide-react';
import portfolioService from '../services/portfolioService';
import PerformanceChart from './PerformanceChart';

const BENCHMARKS = [
  { id: 'SPY', name: 'S&P 500 (SPY)', description: 'Broad market index' },
  { id: 'QQQ', name: 'NASDAQ-100 (QQQ)', description: 'Tech heavy' },
  { id: 'SCHD', name: 'Schwab Dividend ETF', description: 'Dividend focused' },
  { id: 'VIG', name: 'Vanguard Dividend ETF', description: 'Dividend appreciation' },
  { id: 'BTC', name: 'Bitcoin', description: 'Cryptocurrency' },
  { id: 'ETH', name: 'Ethereum', description: 'Cryptocurrency' },
  { id: 'CUSTOM', name: 'Custom Blended', description: 'User-defined mix' }
];

const CUSTOM_BENCHMARK_OPTIONS = ['QQQ', 'SCHD', 'VIG', 'BTC', 'ETH'];

const BenchmarkComparison = () => {
  const [selectedBenchmark, setSelectedBenchmark] = useState('SPY');
  const [adjustForInflation, setAdjustForInflation] = useState(false);
  const [customWeights, setCustomWeights] = useState({ QQQ: 0.4, SCHD: 0.3, BTC: 0.3 });
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState({ from: null, to: null });

  // Set default date range (1 year back to today)
  useEffect(() => {
    const to = new Date();
    const from = new Date();
    from.setFullYear(from.getFullYear() - 1);
    setDateRange({
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0]
    });
  }, []);

  const fetchBenchmarkData = useCallback(async () => {
    if (!dateRange.from || !dateRange.to) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const weights = selectedBenchmark === 'CUSTOM' ? customWeights : null;
      const result = await portfolioService.getBenchmarkComparison(
        selectedBenchmark,
        dateRange.from,
        dateRange.to,
        weights,
        adjustForInflation
      );
      setData(result);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch benchmark data');
      console.error('Benchmark fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedBenchmark, dateRange.from, dateRange.to, customWeights, adjustForInflation]);

  useEffect(() => {
    if (dateRange.from && dateRange.to && selectedBenchmark) {
      fetchBenchmarkData();
    }
  }, [dateRange.from, dateRange.to, selectedBenchmark, fetchBenchmarkData]);

  // Update custom weights and refetch when modal closes
  const handleCustomWeightsChange = (symbol, value) => {
    const newWeights = { ...customWeights, [symbol]: value / 100 };
    setCustomWeights(newWeights);
  };

  const handleCustomModalClose = () => {
    // Validate weights sum to 100%
    const total = Object.values(customWeights).reduce((sum, w) => sum + w, 0);
    if (Math.abs(total - 1.0) > 0.01) {
      // Auto-normalize if close
      const normalized = {};
      Object.keys(customWeights).forEach(key => {
        normalized[key] = customWeights[key] / total;
      });
      setCustomWeights(normalized);
    }
    setShowCustomModal(false);
    // Refetch after a short delay to ensure state is updated
    setTimeout(() => {
      fetchBenchmarkData();
    }, 100);
  };

  const getTotalWeight = () => {
    return Object.values(customWeights).reduce((sum, w) => sum + w, 0) * 100;
  };

  const formatPercent = (value) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const generateInsight = () => {
    if (!data?.stats) return null;
    
    const { portfolioReturnPct, benchmarkReturnPct, portfolioCagrPct, benchmarkCagrPct } = data.stats;
    const diff = portfolioReturnPct - benchmarkReturnPct;
    const cagrDiff = portfolioCagrPct - benchmarkCagrPct;
    
    const benchmarkName = BENCHMARKS.find(b => b.id === selectedBenchmark)?.name || selectedBenchmark;
    
    if (Math.abs(diff) < 1) {
      return `Your portfolio performed similarly to ${benchmarkName}, with a difference of only ${formatPercent(diff)}.`;
    }
    
    if (diff > 0) {
      return `Your portfolio outperformed ${benchmarkName} by ${formatPercent(diff)} over this period. This translates to a ${formatPercent(cagrDiff)} higher annualized return (CAGR).`;
    } else {
      return `Your portfolio underperformed ${benchmarkName} by ${formatPercent(Math.abs(diff))} over this period. This translates to a ${formatPercent(Math.abs(cagrDiff))} lower annualized return (CAGR).`;
    }
  };

  const formatDateRange = () => {
    if (!dateRange.from || !dateRange.to) return '';
    const from = new Date(dateRange.from).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const to = new Date(dateRange.to).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return `${from} - ${to}`;
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Benchmark Comparison</span>
            <Badge variant="outline" className="text-xs">
              {formatDateRange()}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Select Benchmark</Label>
              <Select value={selectedBenchmark} onValueChange={setSelectedBenchmark}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BENCHMARKS.map(benchmark => (
                    <SelectItem key={benchmark.id} value={benchmark.id}>
                      <div>
                        <div className="font-medium">{benchmark.name}</div>
                        <div className="text-xs text-gray-500">{benchmark.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedBenchmark === 'CUSTOM' && (
              <div className="space-y-2">
                <Label>Custom Benchmark</Label>
                <Dialog open={showCustomModal} onOpenChange={setShowCustomModal}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full">
                      Configure Weights
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Custom Benchmark Weights</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      {CUSTOM_BENCHMARK_OPTIONS.map(symbol => {
                        const value = (customWeights[symbol] || 0) * 100;
                        return (
                          <div key={symbol} className="space-y-2">
                            <div className="flex justify-between items-center">
                              <Label>{symbol}</Label>
                              <span className="text-sm font-medium">{value.toFixed(1)}%</span>
                            </div>
                            <Slider
                              value={[value]}
                              onValueChange={([val]) => handleCustomWeightsChange(symbol, val)}
                              max={100}
                              step={1}
                              className="w-full"
                            />
                          </div>
                        );
                      })}
                      <div className="pt-4 border-t">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">Total</span>
                          <span className={`font-bold ${Math.abs(getTotalWeight() - 100) < 1 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {getTotalWeight().toFixed(1)}%
                          </span>
                        </div>
                        {Math.abs(getTotalWeight() - 100) >= 1 && (
                          <p className="text-xs text-red-600 mt-1">
                            Weights must sum to 100%
                          </p>
                        )}
                      </div>
                      <Button 
                        onClick={handleCustomModalClose} 
                        className="w-full"
                        disabled={Math.abs(getTotalWeight() - 100) >= 1}
                      >
                        Apply Weights
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Switch
                id="inflation-toggle"
                checked={adjustForInflation}
                onCheckedChange={setAdjustForInflation}
              />
              <Label htmlFor="inflation-toggle" className="cursor-pointer">
                Adjust for inflation (show real returns)
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      {isLoading ? (
        <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
          <CardContent className="h-96 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading benchmark data...</p>
            </div>
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
          <CardContent className="h-96 flex items-center justify-center">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <p className="text-red-600 font-medium">{error}</p>
              <Button onClick={fetchBenchmarkData} className="mt-4" variant="outline">
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : data ? (
        <>
          {/* Insight */}
          {generateInsight() && (
            <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200">
              <CardContent className="pt-6">
                <p className="text-sm text-gray-700">{generateInsight()}</p>
              </CardContent>
            </Card>
          )}

          {/* Chart */}
          <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
            <CardHeader>
              <CardTitle>
                Portfolio vs {BENCHMARKS.find(b => b.id === selectedBenchmark)?.name || selectedBenchmark}
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                Normalized to 100 at start date {adjustForInflation && '(inflation-adjusted)'}
              </p>
            </CardHeader>
            <CardContent>
              <PerformanceChart
                data={data.portfolio.map((p, i) => ({
                  date: p.date,
                  portfolio: p.value,
                  spy: data.benchmark[i]?.value || 0
                }))}
                showComparison={true}
              />
            </CardContent>
          </Card>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">Total Return</p>
                  <div className="flex items-baseline space-x-2">
                    <span className={`text-2xl font-bold ${data.stats.portfolioReturnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatPercent(data.stats.portfolioReturnPct)}
                    </span>
                    <span className="text-sm text-gray-500">Portfolio</span>
                  </div>
                  <div className="flex items-baseline space-x-2">
                    <span className={`text-lg font-semibold ${data.stats.benchmarkReturnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatPercent(data.stats.benchmarkReturnPct)}
                    </span>
                    <span className="text-xs text-gray-500">Benchmark</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">CAGR (Annualized)</p>
                  <div className="flex items-baseline space-x-2">
                    <span className={`text-2xl font-bold ${data.stats.portfolioCagrPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatPercent(data.stats.portfolioCagrPct)}
                    </span>
                    <span className="text-sm text-gray-500">Portfolio</span>
                  </div>
                  <div className="flex items-baseline space-x-2">
                    <span className={`text-lg font-semibold ${data.stats.benchmarkCagrPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatPercent(data.stats.benchmarkCagrPct)}
                    </span>
                    <span className="text-xs text-gray-500">Benchmark</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">Max Drawdown</p>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-2xl font-bold text-red-600">
                      {formatPercent(-data.stats.portfolioMaxDrawdownPct)}
                    </span>
                    <span className="text-sm text-gray-500">Portfolio</span>
                  </div>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-lg font-semibold text-red-600">
                      {formatPercent(-data.stats.benchmarkMaxDrawdownPct)}
                    </span>
                    <span className="text-xs text-gray-500">Benchmark</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {adjustForInflation && data.stats.portfolioRealReturnPct !== undefined && (
              <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
                <CardContent className="pt-6">
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600">Real Return (Inflation-Adjusted)</p>
                    <div className="flex items-baseline space-x-2">
                      <span className={`text-2xl font-bold ${data.stats.portfolioRealReturnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatPercent(data.stats.portfolioRealReturnPct)}
                      </span>
                      <span className="text-sm text-gray-500">Portfolio</span>
                    </div>
                    <div className="flex items-baseline space-x-2">
                      <span className={`text-lg font-semibold ${data.stats.benchmarkRealReturnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatPercent(data.stats.benchmarkRealReturnPct)}
                      </span>
                      <span className="text-xs text-gray-500">Benchmark</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      ) : (
        <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
          <CardContent className="h-96 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <BarChart3 className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>Select a benchmark to compare</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BenchmarkComparison;

