import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Badge } from './ui/badge';
import { TrendingUp, Target, DollarSign, Calendar, AlertCircle, Loader2 } from 'lucide-react';
import portfolioService from '../services/portfolioService';
import PerformanceChart from './PerformanceChart';
import { useToast } from '../hooks/use-toast';

const PRESETS = {
  conservative: {
    expectedAnnualReturnPct: 0.05,
    annualVolatilityPct: 0.10,
    label: 'Conservative'
  },
  moderate: {
    expectedAnnualReturnPct: 0.07,
    annualVolatilityPct: 0.15,
    label: 'Moderate'
  },
  aggressive: {
    expectedAnnualReturnPct: 0.09,
    annualVolatilityPct: 0.25,
    label: 'Aggressive'
  }
};

const FutureProjections = ({ currentPortfolioValue }) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [projectionData, setProjectionData] = useState(null);
  const [error, setError] = useState(null);
  
  const [inputs, setInputs] = useState({
    currentPortfolioValue: currentPortfolioValue || 0,
    currentAge: null,
    targetAmount: 1000000,
    targetAge: null,
    monthlyContribution: 1000,
    annualContributionIncreasePct: 0.03,
    expectedAnnualReturnPct: 0.07,
    annualVolatilityPct: 0.15,
    years: 30,
    effectiveTaxRatePct: 0.20
  });

  const [warnings, setWarnings] = useState([]);

  // Validate inputs and set warnings
  useEffect(() => {
    const newWarnings = [];
    
    if (inputs.expectedAnnualReturnPct > 0.15) {
      newWarnings.push('Expected return above 15% is very optimistic');
    }
    if (inputs.annualVolatilityPct > 0.40) {
      newWarnings.push('Volatility above 40% indicates high risk');
    }
    if (inputs.monthlyContribution < 0) {
      newWarnings.push('Monthly contribution cannot be negative');
    }
    
    setWarnings(newWarnings);
  }, [inputs]);

  const handleInputChange = (field, value) => {
    setInputs(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const applyPreset = (presetKey) => {
    const preset = PRESETS[presetKey];
    setInputs(prev => ({
      ...prev,
      expectedAnnualReturnPct: preset.expectedAnnualReturnPct,
      annualVolatilityPct: preset.annualVolatilityPct
    }));
    toast({
      title: `${preset.label} preset applied`,
      description: `Return: ${(preset.expectedAnnualReturnPct * 100).toFixed(1)}%, Volatility: ${(preset.annualVolatilityPct * 100).toFixed(1)}%`
    });
  };

  const calculateProjections = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Prepare input data
      const projectionInput = {
        currentPortfolioValue: inputs.currentPortfolioValue,
        currentAge: inputs.currentAge || null,
        targetAmount: inputs.targetAmount || null,
        targetAge: inputs.targetAge || null,
        monthlyContribution: inputs.monthlyContribution,
        annualContributionIncreasePct: inputs.annualContributionIncreasePct,
        expectedAnnualReturnPct: inputs.expectedAnnualReturnPct,
        annualVolatilityPct: inputs.annualVolatilityPct,
        years: inputs.years,
        effectiveTaxRatePct: inputs.effectiveTaxRatePct
      };
      
      const result = await portfolioService.calculateProjections(projectionInput);
      setProjectionData(result);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to calculate projections');
      console.error('Projection error:', err);
      toast({
        title: 'Error',
        description: err.response?.data?.detail || 'Failed to calculate projections',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  }, [inputs, toast]);

  // Auto-calculate on mount and when inputs change (debounced)
  useEffect(() => {
    if (inputs.currentPortfolioValue > 0) {
      const timer = setTimeout(() => {
        calculateProjections();
      }, 500); // 500ms debounce
      
      return () => clearTimeout(timer);
    }
  }, [inputs, calculateProjections]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (value) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Controls */}
      <div className="lg:col-span-1 space-y-6">
        <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Target className="w-5 h-5 mr-2 text-purple-500" />
              Projection Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Presets */}
            <div className="space-y-2">
              <Label>Risk Profile Presets</Label>
              <div className="flex gap-2">
                {Object.keys(PRESETS).map(key => (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    onClick={() => applyPreset(key)}
                    className="flex-1"
                  >
                    {PRESETS[key].label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Current Portfolio Value */}
            <div className="space-y-2">
              <Label htmlFor="current-value">Current Portfolio Value</Label>
              <Input
                id="current-value"
                type="number"
                value={inputs.currentPortfolioValue}
                onChange={(e) => handleInputChange('currentPortfolioValue', parseFloat(e.target.value) || 0)}
                className="text-lg font-semibold"
              />
            </div>

            {/* Current Age (Optional) */}
            <div className="space-y-2">
              <Label htmlFor="current-age">Current Age (Optional)</Label>
              <Input
                id="current-age"
                type="number"
                value={inputs.currentAge || ''}
                onChange={(e) => handleInputChange('currentAge', e.target.value ? parseInt(e.target.value) : null)}
                placeholder="e.g., 30"
              />
            </div>

            {/* Target Amount */}
            <div className="space-y-2">
              <Label htmlFor="target-amount">Target FI Amount (Optional)</Label>
              <Input
                id="target-amount"
                type="number"
                value={inputs.targetAmount || ''}
                onChange={(e) => handleInputChange('targetAmount', e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="e.g., 1000000"
              />
            </div>

            {/* Target Age (Optional) */}
            <div className="space-y-2">
              <Label htmlFor="target-age">Target Age (Optional)</Label>
              <Input
                id="target-age"
                type="number"
                value={inputs.targetAge || ''}
                onChange={(e) => handleInputChange('targetAge', e.target.value ? parseInt(e.target.value) : null)}
                placeholder="e.g., 55"
              />
            </div>

            {/* Monthly Contribution */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Monthly Contribution</Label>
                <span className="text-sm font-medium">{formatCurrency(inputs.monthlyContribution)}</span>
              </div>
              <Slider
                value={[inputs.monthlyContribution]}
                onValueChange={([val]) => handleInputChange('monthlyContribution', val)}
                min={0}
                max={10000}
                step={100}
                className="w-full"
              />
            </div>

            {/* Annual Contribution Increase */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Annual Contribution Increase</Label>
                <span className="text-sm font-medium">{formatPercent(inputs.annualContributionIncreasePct)}</span>
              </div>
              <Slider
                value={[inputs.annualContributionIncreasePct * 100]}
                onValueChange={([val]) => handleInputChange('annualContributionIncreasePct', val / 100)}
                min={0}
                max={10}
                step={0.1}
                className="w-full"
              />
            </div>

            {/* Expected Annual Return */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Expected Annual Return</Label>
                <span className="text-sm font-medium">{formatPercent(inputs.expectedAnnualReturnPct)}</span>
              </div>
              <Slider
                value={[inputs.expectedAnnualReturnPct * 100]}
                onValueChange={([val]) => handleInputChange('expectedAnnualReturnPct', val / 100)}
                min={2}
                max={15}
                step={0.1}
                className="w-full"
              />
            </div>

            {/* Annual Volatility */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Annual Volatility</Label>
                <span className="text-sm font-medium">{formatPercent(inputs.annualVolatilityPct)}</span>
              </div>
              <Slider
                value={[inputs.annualVolatilityPct * 100]}
                onValueChange={([val]) => handleInputChange('annualVolatilityPct', val / 100)}
                min={5}
                max={40}
                step={0.5}
                className="w-full"
              />
            </div>

            {/* Projection Horizon */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Projection Horizon (Years)</Label>
                <span className="text-sm font-medium">{inputs.years} years</span>
              </div>
              <Slider
                value={[inputs.years]}
                onValueChange={([val]) => handleInputChange('years', val)}
                min={5}
                max={40}
                step={1}
                className="w-full"
              />
            </div>

            {/* Effective Tax Rate */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Effective Tax Rate on Withdrawals</Label>
                <span className="text-sm font-medium">{formatPercent(inputs.effectiveTaxRatePct)}</span>
              </div>
              <Slider
                value={[inputs.effectiveTaxRatePct * 100]}
                onValueChange={([val]) => handleInputChange('effectiveTaxRatePct', val / 100)}
                min={0}
                max={40}
                step={0.5}
                className="w-full"
              />
            </div>

            {/* Warnings */}
            {warnings.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                {warnings.map((warning, idx) => (
                  <div key={idx} className="flex items-start text-sm text-amber-800">
                    <AlertCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Recalculate Button */}
            <Button
              onClick={calculateProjections}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Calculating...
                </>
              ) : (
                'Recalculate Projections'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Right: Charts & Summary */}
      <div className="lg:col-span-2 space-y-6">
        {isLoading ? (
          <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
            <CardContent className="h-96 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="w-12 h-12 animate-spin text-purple-500 mx-auto mb-4" />
                <p className="text-gray-600">Running Monte Carlo simulation...</p>
                <p className="text-sm text-gray-500 mt-2">This may take a few seconds</p>
              </div>
            </CardContent>
          </Card>
        ) : error ? (
          <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
            <CardContent className="h-96 flex items-center justify-center">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <p className="text-red-600 font-medium">{error}</p>
                <Button onClick={calculateProjections} className="mt-4" variant="outline">
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : projectionData ? (
          <>
            {/* Projection Chart */}
            <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
              <CardHeader>
                <CardTitle>Portfolio Projection</CardTitle>
                <p className="text-sm text-gray-600 mt-1">
                  Deterministic path vs Monte Carlo median (with confidence bands)
                </p>
              </CardHeader>
              <CardContent>
                <ProjectionChart
                  deterministicPath={projectionData.deterministicPath}
                  medianPath={projectionData.medianPath}
                  p10Path={projectionData.p10Path}
                  p90Path={projectionData.p90Path}
                />
              </CardContent>
            </Card>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
                <CardContent className="pt-6">
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600">Median Ending Value</p>
                    <p className="text-3xl font-bold text-purple-600">
                      {formatCurrency(projectionData.summary.medianEndingValue)}
                    </p>
                    <p className="text-xs text-gray-500">50th percentile</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
                <CardContent className="pt-6">
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600">Confidence Range</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {formatCurrency(projectionData.summary.p10EndingValue)}
                    </p>
                    <p className="text-xs text-gray-500">10th percentile</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {formatCurrency(projectionData.summary.p90EndingValue)}
                    </p>
                    <p className="text-xs text-gray-500">90th percentile</p>
                  </div>
                </CardContent>
              </Card>

              {projectionData.summary.probabilityOfHittingTarget !== null && (
                <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
                  <CardContent className="pt-6">
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600">Probability of Hitting Target</p>
                      <p className="text-3xl font-bold text-emerald-600">
                        {projectionData.summary.probabilityOfHittingTarget.toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-500">
                        Chance of reaching {formatCurrency(inputs.targetAmount || 0)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {(projectionData.summary.estimatedFIYear || projectionData.summary.estimatedFIAge) && (
                <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
                  <CardContent className="pt-6">
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600">Estimated Financial Independence</p>
                      {projectionData.summary.estimatedFIAge && (
                        <p className="text-2xl font-bold text-blue-600">
                          Age {projectionData.summary.estimatedFIAge}
                        </p>
                      )}
                      {projectionData.summary.estimatedFIYear && (
                        <p className="text-lg font-semibold text-gray-700">
                          Year {projectionData.summary.estimatedFIYear}
                        </p>
                      )}
                      <p className="text-xs text-gray-500">Median estimate</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {projectionData.summary.taxInfo && (
                <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl md:col-span-2">
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-gray-700">Withdrawal Tax Implications (4% Rule)</p>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-gray-500">Gross Withdrawal</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {formatCurrency(projectionData.summary.taxInfo.grossWithdrawal)}/year
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Tax Amount</p>
                          <p className="text-lg font-semibold text-red-600">
                            {formatCurrency(projectionData.summary.taxInfo.taxAmount)}/year
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Net Withdrawal</p>
                          <p className="text-lg font-semibold text-emerald-600">
                            {formatCurrency(projectionData.summary.taxInfo.netWithdrawal)}/year
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">
                        Based on {formatPercent(projectionData.summary.taxInfo.taxRatePct)} effective tax rate
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Explanation Section */}
            {projectionData && (
              <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200">
                <CardHeader>
                  <CardTitle className="flex items-center text-gray-800">
                    <AlertCircle className="w-5 h-5 mr-2 text-blue-600" />
                    Understanding Your Projections
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-gray-700">
                  <ProjectionExplanation
                    inputs={inputs}
                    summary={projectionData.summary}
                    deterministicPath={projectionData.deterministicPath}
                  />
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
            <CardContent className="h-96 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <TrendingUp className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>Configure settings and click "Recalculate Projections"</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

// Explanation Component
const ProjectionExplanation = ({ inputs, summary, deterministicPath }) => {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (value) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const startingValue = inputs.currentPortfolioValue;
  const endingValue = deterministicPath[deterministicPath.length - 1]?.portfolioValue || 0;
  const totalGrowth = endingValue - startingValue;
  const totalGrowthPercent = startingValue > 0 ? ((endingValue / startingValue) - 1) * 100 : 0;
  
  const totalContributions = inputs.monthlyContribution * 12 * inputs.years;
  const contributionGrowth = endingValue - startingValue - totalContributions;
  
  const medianEnding = summary.medianEndingValue;
  const p10Ending = summary.p10EndingValue;
  const p90Ending = summary.p90EndingValue;
  const range = p90Ending - p10Ending;
  const rangePercent = medianEnding > 0 ? (range / medianEnding) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* What You're Starting With */}
      <div>
        <h4 className="font-semibold text-gray-900 mb-2">📊 Your Starting Point</h4>
        <p className="mb-1">
          You're starting with <strong>{formatCurrency(startingValue)}</strong> in your portfolio.
        </p>
        <p className="mb-1">
          You plan to contribute <strong>{formatCurrency(inputs.monthlyContribution)}</strong> per month
          {inputs.annualContributionIncreasePct > 0 && (
            <span>, increasing by <strong>{formatPercent(inputs.annualContributionIncreasePct)}</strong> each year</span>
          )}.
        </p>
        <p>
          Over <strong>{inputs.years} years</strong>, you'll contribute approximately{' '}
          <strong>{formatCurrency(totalContributions)}</strong> in total.
        </p>
      </div>

      {/* Deterministic Projection */}
      <div>
        <h4 className="font-semibold text-gray-900 mb-2">📈 Deterministic Projection (Green Line)</h4>
        <p className="mb-1">
          This shows what your portfolio would be worth if it grows at exactly{' '}
          <strong>{formatPercent(inputs.expectedAnnualReturnPct)}</strong> every year, with no variation.
        </p>
        <p className="mb-1">
          <strong>Projected ending value:</strong> {formatCurrency(endingValue)}
        </p>
        <p className="mb-1">
          <strong>Total growth:</strong> {formatCurrency(totalGrowth)} ({formatPercent(totalGrowthPercent / 100)})
        </p>
        <p className="text-xs text-gray-600 italic">
          Note: This is an idealized scenario. Real markets have volatility, which is why we also run Monte Carlo simulations.
        </p>
      </div>

      {/* Monte Carlo Simulation */}
      <div>
        <h4 className="font-semibold text-gray-900 mb-2">🎲 Monte Carlo Simulation (Purple Dashed Line)</h4>
        <p className="mb-1">
          We ran <strong>500 simulations</strong> where each year's return is randomly drawn from a normal distribution:
        </p>
        <ul className="list-disc list-inside ml-2 mb-2 space-y-1">
          <li>Average return: <strong>{formatPercent(inputs.expectedAnnualReturnPct)}</strong></li>
          <li>Volatility: <strong>{formatPercent(inputs.annualVolatilityPct)}</strong> (standard deviation)</li>
        </ul>
        <p className="mb-1">
          The <strong>median ending value</strong> (50th percentile) is <strong>{formatCurrency(medianEnding)}</strong>.
        </p>
        <p className="text-xs text-gray-600 italic">
          This means 50% of simulations ended above this value, and 50% ended below.
        </p>
      </div>

      {/* Confidence Bands */}
      <div>
        <h4 className="font-semibold text-gray-900 mb-2">📊 Confidence Bands (Shaded Area)</h4>
        <p className="mb-1">
          The shaded area shows the <strong>90% confidence range</strong>:
        </p>
        <ul className="list-disc list-inside ml-2 mb-2 space-y-1">
          <li><strong>10th percentile:</strong> {formatCurrency(p10Ending)} (10% of simulations did worse)</li>
          <li><strong>90th percentile:</strong> {formatCurrency(p90Ending)} (10% of simulations did better)</li>
        </ul>
        <p className="mb-1">
          The range of <strong>{formatCurrency(range)}</strong> ({formatPercent(rangePercent / 100)}) shows the uncertainty
          due to market volatility.
        </p>
        <p className="text-xs text-gray-600 italic">
          Higher volatility = wider confidence bands = more uncertainty in outcomes.
        </p>
      </div>

      {/* Growth Breakdown */}
      <div>
        <h4 className="font-semibold text-gray-900 mb-2">💰 Growth Breakdown</h4>
        <p className="mb-1">
          Of your projected growth from <strong>{formatCurrency(startingValue)}</strong> to{' '}
          <strong>{formatCurrency(endingValue)}</strong>:
        </p>
        <ul className="list-disc list-inside ml-2 mb-2 space-y-1">
          <li><strong>From contributions:</strong> ~{formatCurrency(totalContributions)}</li>
          <li><strong>From investment returns:</strong> ~{formatCurrency(contributionGrowth)}</li>
        </ul>
        <p className="text-xs text-gray-600 italic">
          This shows how much of your growth comes from saving vs. investing returns.
        </p>
      </div>

      {/* Financial Independence */}
      {summary.estimatedFIAge && (
        <div>
          <h4 className="font-semibold text-gray-900 mb-2">🎯 Financial Independence Estimate</h4>
          <p className="mb-1">
            Based on the Monte Carlo simulations, you have a{' '}
            <strong>{summary.probabilityOfHittingTarget?.toFixed(1)}%</strong> chance of reaching your target of{' '}
            <strong>{formatCurrency(inputs.targetAmount || 0)}</strong>.
          </p>
          {summary.estimatedFIAge && (
            <p className="mb-1">
              The <strong>median estimated FI age</strong> is <strong>{summary.estimatedFIAge}</strong>
              {summary.estimatedFIYear && (
                <span> (year {summary.estimatedFIYear})</span>
              )}.
            </p>
          )}
          <p className="text-xs text-gray-600 italic">
            This is the age at which 50% of simulations reached your target amount.
          </p>
        </div>
      )}

      {/* Tax Implications */}
      {summary.taxInfo && (
        <div>
          <h4 className="font-semibold text-gray-900 mb-2">💸 Tax Implications (4% Withdrawal Rule)</h4>
          <p className="mb-1">
            If you withdraw <strong>4%</strong> of your portfolio annually at your target:
          </p>
          <ul className="list-disc list-inside ml-2 mb-2 space-y-1">
            <li><strong>Gross withdrawal:</strong> {formatCurrency(summary.taxInfo.grossWithdrawal)}/year</li>
            <li><strong>Tax ({formatPercent(summary.taxInfo.taxRatePct)}):</strong> {formatCurrency(summary.taxInfo.taxAmount)}/year</li>
            <li><strong>Net withdrawal:</strong> {formatCurrency(summary.taxInfo.netWithdrawal)}/year</li>
          </ul>
          <p className="text-xs text-gray-600 italic">
            The 4% rule is a common retirement withdrawal strategy suggesting you can safely withdraw 4% of your portfolio annually.
          </p>
        </div>
      )}

      {/* Key Insights */}
      <div className="pt-4 border-t border-blue-200">
        <h4 className="font-semibold text-gray-900 mb-2">💡 Key Insights</h4>
        <ul className="list-disc list-inside ml-2 space-y-1">
          {inputs.expectedAnnualReturnPct > 0.08 && (
            <li className="text-amber-700">
              <strong>High expected return:</strong> Your {formatPercent(inputs.expectedAnnualReturnPct)} expected return is optimistic. 
              Historical S&P 500 returns average ~7-10% annually.
            </li>
          )}
          {inputs.annualVolatilityPct > 0.20 && (
            <li className="text-amber-700">
              <strong>High volatility:</strong> Your {formatPercent(inputs.annualVolatilityPct)} volatility indicates significant risk. 
              Be prepared for large swings in portfolio value.
            </li>
          )}
          {inputs.monthlyContribution > 0 && (
            <li>
              <strong>Consistent contributions matter:</strong> Your monthly contributions of {formatCurrency(inputs.monthlyContribution)} 
              will significantly impact your final portfolio value, especially over {inputs.years} years.
            </li>
          )}
          {summary.probabilityOfHittingTarget !== null && summary.probabilityOfHittingTarget < 50 && (
            <li className="text-red-700">
              <strong>Low probability:</strong> Only {summary.probabilityOfHittingTarget?.toFixed(1)}% chance of reaching your target. 
              Consider increasing contributions, extending timeline, or adjusting expectations.
            </li>
          )}
          {summary.probabilityOfHittingTarget !== null && summary.probabilityOfHittingTarget >= 80 && (
            <li className="text-emerald-700">
              <strong>High probability:</strong> {summary.probabilityOfHittingTarget?.toFixed(1)}% chance of reaching your target! 
              You're on a good track.
            </li>
          )}
          <li>
            <strong>Remember:</strong> These are projections based on assumptions. Actual results will vary. 
            Review and adjust your plan regularly.
          </li>
        </ul>
      </div>
    </div>
  );
};

// Projection Chart Component
const ProjectionChart = ({ deterministicPath, medianPath, p10Path, p90Path }) => {
  if (!deterministicPath || deterministicPath.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-gray-500">
        <p>No projection data available</p>
      </div>
    );
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Prepare data for chart
  const chartData = deterministicPath.map((point, i) => ({
    date: `Year ${point.year}`,
    year: point.year,
    deterministic: point.portfolioValue,
    median: medianPath && medianPath[i] ? medianPath[i].portfolioValue : 0,
    p10: p10Path && p10Path[i] ? p10Path[i].portfolioValue : 0,
    p90: p90Path && p90Path[i] ? p90Path[i].portfolioValue : 0
  }));

  // Calculate min/max for scaling
  const allValues = [
    ...chartData.map(d => d.deterministic),
    ...chartData.map(d => d.median).filter(v => v > 0),
    ...chartData.map(d => d.p10).filter(v => v > 0),
    ...chartData.map(d => d.p90).filter(v => v > 0)
  ].filter(v => v > 0);
  
  const minValue = Math.max(0, Math.min(...allValues) * 0.9);
  const maxValue = Math.max(...allValues) * 1.1;
  const valueRange = maxValue - minValue;

  const width = 1000;
  const height = 550;
  const margin = { top: 50, right: 200, bottom: 80, left: 120 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const firstYear = chartData[0].year;
  const lastYear = chartData[chartData.length - 1].year;
  const yearRange = lastYear - firstYear;

  const xScale = (year) => margin.left + ((year - firstYear) / yearRange) * chartWidth;
  const yScale = (value) => margin.top + chartHeight - ((value - minValue) / valueRange) * chartHeight;

  // Generate smooth path for deterministic line
  const deterministicPathData = chartData
    .map((d, i) => {
      const x = xScale(d.year);
      const y = yScale(d.deterministic);
      if (i === 0) return `M ${x} ${y}`;
      return `L ${x} ${y}`;
    })
    .join(' ');

  // Generate smooth path for median line
  const medianPathData = medianPath && medianPath.length > 0
    ? chartData
        .map((d, i) => {
          const x = xScale(d.year);
          const y = yScale(d.median);
          if (i === 0) return `M ${x} ${y}`;
          return `L ${x} ${y}`;
        })
        .join(' ')
    : '';

  // Generate confidence band (area between p10 and p90)
  const confidenceBandPath = p10Path && p90Path && p10Path.length > 0 && p90Path.length > 0
    ? (() => {
        const upperPoints = chartData.map((d) => `${xScale(d.year)},${yScale(d.p90)}`).join(' ');
        const lowerPoints = chartData.slice().reverse().map((d) => `${xScale(d.year)},${yScale(d.p10)}`).join(' ');
        return `M ${xScale(chartData[0].year)},${yScale(chartData[0].p90)} L ${upperPoints} L ${lowerPoints} Z`;
      })()
    : '';

  // Generate Y-axis tick marks
  const yTicks = 6;
  const yTickValues = [];
  for (let i = 0; i <= yTicks; i++) {
    const value = minValue + (valueRange * i / yTicks);
    yTickValues.push(value);
  }

  // Generate X-axis tick marks (show every 5 years or fewer)
  const xTickInterval = Math.max(1, Math.ceil(yearRange / 10));
  const xTickValues = [];
  for (let year = firstYear; year <= lastYear; year += xTickInterval) {
    xTickValues.push(year);
  }
  if (xTickValues[xTickValues.length - 1] !== lastYear) {
    xTickValues.push(lastYear);
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-6 shadow-lg border border-gray-100">
        <svg width={width} height={height} className="w-full h-auto" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          {/* Enhanced confidence band gradient */}
          <linearGradient id="confidenceGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.3" />
            <stop offset="30%" stopColor="#8b5cf6" stopOpacity="0.2" />
            <stop offset="70%" stopColor="#a78bfa" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0.08" />
          </linearGradient>
          
          {/* Deterministic line gradient */}
          <linearGradient id="deterministicGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
          
          {/* Median line gradient */}
          <linearGradient id="medianGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="50%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          
          {/* Enhanced shadow filters */}
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
            <feOffset dx="0" dy="2" result="offsetblur"/>
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.15"/>
            </feComponentTransfer>
            <feMerge>
              <feMergeNode/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          
          {/* Background gradient */}
          <linearGradient id="backgroundGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f9fafb" />
          </linearGradient>
        </defs>

        {/* Background with subtle gradient */}
        <rect width={width} height={height} fill="url(#backgroundGradient)" />

        {/* Grid lines (horizontal) - more elegant */}
        {yTickValues.map((value, i) => {
          const y = yScale(value);
          const isEdge = i === 0 || i === yTickValues.length - 1;
          return (
            <g key={`grid-${i}`}>
              <line
                x1={margin.left}
                y1={y}
                x2={width - margin.right}
                y2={y}
                stroke={isEdge ? "#d1d5db" : "#e5e7eb"}
                strokeWidth={isEdge ? "2" : "1"}
                strokeDasharray={isEdge ? "0" : "3,3"}
                opacity={isEdge ? "0.6" : "0.4"}
              />
            </g>
          );
        })}

        {/* Confidence band - draw first so it's behind the lines */}
        {confidenceBandPath && (
          <path
            d={confidenceBandPath}
            fill="url(#confidenceGradient)"
            stroke="#8b5cf6"
            strokeWidth="1.5"
            strokeOpacity="0.25"
          />
        )}

        {/* P10 and P90 boundary lines (subtle and elegant) */}
        {p10Path && p10Path.length > 0 && (
          <path
            d={chartData.map((d, i) => i === 0 ? `M ${xScale(d.year)} ${yScale(d.p10)}` : `L ${xScale(d.year)} ${yScale(d.p10)}`).join(' ')}
            fill="none"
            stroke="#a78bfa"
            strokeWidth="1.5"
            strokeDasharray="4,4"
            strokeOpacity="0.5"
            strokeLinecap="round"
          />
        )}
        {p90Path && p90Path.length > 0 && (
          <path
            d={chartData.map((d, i) => i === 0 ? `M ${xScale(d.year)} ${yScale(d.p90)}` : `L ${xScale(d.year)} ${yScale(d.p90)}`).join(' ')}
            fill="none"
            stroke="#a78bfa"
            strokeWidth="1.5"
            strokeDasharray="4,4"
            strokeOpacity="0.5"
            strokeLinecap="round"
          />
        )}

        {/* Deterministic line - bold, smooth, and appealing */}
        <path
          d={deterministicPathData}
          fill="none"
          stroke="url(#deterministicGradient)"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#shadow)"
          opacity="0.95"
        />
        {/* Subtle glow effect for deterministic */}
        <path
          d={deterministicPathData}
          fill="none"
          stroke="#10b981"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.2"
          filter="url(#glow)"
        />

        {/* Median line - dashed, smooth, and appealing */}
        {medianPathData && (
          <>
            <path
              d={medianPathData}
              fill="none"
              stroke="url(#medianGradient)"
              strokeWidth="3.5"
              strokeDasharray="10,5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#shadow)"
              opacity="0.9"
            />
            {/* Subtle glow for median */}
            <path
              d={medianPathData}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="5"
              strokeDasharray="10,5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.15"
              filter="url(#glow)"
            />
          </>
        )}

        {/* Data points for deterministic - more polished */}
        {chartData.map((d, i) => {
          // Show points at key intervals: start, every 25%, and end
          const showPoint = i === 0 || 
                          i === chartData.length - 1 || 
                          i % Math.max(1, Math.floor(chartData.length / 5)) === 0;
          
          if (showPoint) {
            return (
              <g key={`det-point-${i}`}>
                {/* Outer glow */}
                <circle
                  cx={xScale(d.year)}
                  cy={yScale(d.deterministic)}
                  r="5.5"
                  fill="#10b981"
                  opacity="0.25"
                />
                {/* Main point */}
                <circle
                  cx={xScale(d.year)}
                  cy={yScale(d.deterministic)}
                  r="4.5"
                  fill="#10b981"
                  stroke="white"
                  strokeWidth="2"
                  filter="url(#shadow)"
                />
                {/* Inner highlight */}
                <circle
                  cx={xScale(d.year)}
                  cy={yScale(d.deterministic)}
                  r="1.8"
                  fill="#34d399"
                />
              </g>
            );
          }
          return null;
        })}

        {/* Data points for median - more polished */}
        {medianPathData && chartData.map((d, i) => {
          // Show points at key intervals: start, every 25%, and end
          const showPoint = i === 0 || 
                          i === chartData.length - 1 || 
                          i % Math.max(1, Math.floor(chartData.length / 5)) === 0;
          
          if (showPoint) {
            return (
              <g key={`med-point-${i}`}>
                {/* Outer glow */}
                <circle
                  cx={xScale(d.year)}
                  cy={yScale(d.median)}
                  r="5"
                  fill="#8b5cf6"
                  opacity="0.25"
                />
                {/* Main point */}
                <circle
                  cx={xScale(d.year)}
                  cy={yScale(d.median)}
                  r="4"
                  fill="#8b5cf6"
                  stroke="white"
                  strokeWidth="2"
                  filter="url(#shadow)"
                />
                {/* Inner highlight */}
                <circle
                  cx={xScale(d.year)}
                  cy={yScale(d.median)}
                  r="1.8"
                  fill="#a78bfa"
                />
              </g>
            );
          }
          return null;
        })}

        {/* X-axis - more elegant */}
        <line
          x1={margin.left}
          y1={height - margin.bottom}
          x2={width - margin.right}
          y2={height - margin.bottom}
          stroke="#374151"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.8"
        />

        {/* Y-axis - more elegant */}
        <line
          x1={margin.left}
          y1={margin.top}
          x2={margin.left}
          y2={height - margin.bottom}
          stroke="#374151"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.8"
        />

        {/* Y-axis labels - more polished */}
        {yTickValues.map((value, i) => {
          const y = yScale(value);
          const isEdge = i === 0 || i === yTickValues.length - 1;
          return (
            <g key={`y-label-${i}`}>
              <text
                x={margin.left - 25}
                y={y + 4}
                textAnchor="end"
                fontSize="12"
                fill={isEdge ? "#1f2937" : "#4b5563"}
                fontWeight={isEdge ? "600" : "500"}
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                {formatCurrency(value)}
              </text>
            </g>
          );
        })}

        {/* X-axis labels - more polished */}
        {xTickValues.map((year) => {
          const x = xScale(year);
          return (
            <g key={`x-label-${year}`}>
              <line
                x1={x}
                y1={height - margin.bottom}
                x2={x}
                y2={height - margin.bottom + 8}
                stroke="#374151"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.7"
              />
              <text
                x={x}
                y={height - margin.bottom + 32}
                textAnchor="middle"
                fontSize="12"
                fill="#374151"
                fontWeight="600"
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                Year {year}
              </text>
            </g>
          );
        })}

        {/* Axis labels - more elegant */}
        <text
          x={width / 2}
          y={height - 20}
          textAnchor="middle"
          fontSize="14"
          fill="#1f2937"
          fontWeight="700"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="0.5px"
        >
          Years
        </text>
        <text
          x={30}
          y={height / 2}
          textAnchor="middle"
          fontSize="14"
          fill="#1f2937"
          fontWeight="700"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="0.5px"
          transform={`rotate(-90, 30, ${height / 2})`}
        >
          Portfolio Value ($)
        </text>

        {/* Legend - more appealing and polished */}
        <g transform={`translate(${width - margin.right - 185}, ${margin.top + 20})`}>
          {/* Legend background with gradient and shadow */}
          <defs>
            <linearGradient id="legendGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
              <stop offset="100%" stopColor="#f9fafb" stopOpacity="0.98" />
            </linearGradient>
          </defs>
          <rect 
            x="0" 
            y="0" 
            width="180" 
            height={confidenceBandPath ? "120" : "85"} 
            fill="url(#legendGradient)" 
            rx="12" 
            stroke="#e5e7eb" 
            strokeWidth="1.5"
            filter="url(#shadow)"
          />
          
          {/* Deterministic */}
          <line x1="20" y1="24" x2="45" y2="24" stroke="url(#deterministicGradient)" strokeWidth="5" strokeLinecap="round" />
          <text x="52" y="28" fontSize="13" fill="#1f2937" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">Deterministic Path</text>
          <text x="52" y="42" fontSize="10.5" fill="#6b7280" fontFamily="system-ui, -apple-system, sans-serif">Expected growth (no volatility)</text>
          
          {/* Median */}
          {medianPathData && (
            <>
              <line x1="20" y1="62" x2="45" y2="62" stroke="url(#medianGradient)" strokeWidth="4" strokeDasharray="10,5" strokeLinecap="round" />
              <text x="52" y="66" fontSize="13" fill="#1f2937" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">Monte Carlo Median</text>
              <text x="52" y="80" fontSize="10.5" fill="#6b7280" fontFamily="system-ui, -apple-system, sans-serif">50th percentile (most likely)</text>
            </>
          )}
          
          {/* Confidence band */}
          {confidenceBandPath && (
            <>
              <rect x="20" y="98" width="26" height="14" fill="url(#confidenceGradient)" rx="3" stroke="#8b5cf6" strokeWidth="1.5" strokeOpacity="0.4" />
              <text x="52" y="108" fontSize="13" fill="#1f2937" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">90% Confidence Band</text>
              <text x="52" y="122" fontSize="10.5" fill="#6b7280" fontFamily="system-ui, -apple-system, sans-serif">10th to 90th percentile range</text>
            </>
          )}
        </g>
        </svg>
      </div>
    </div>
  );
};

export default FutureProjections;

