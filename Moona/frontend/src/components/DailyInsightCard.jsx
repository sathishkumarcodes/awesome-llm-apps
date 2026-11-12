import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Lightbulb, TrendingUp, TrendingDown, AlertCircle, Loader2, RefreshCw, ChevronRight } from 'lucide-react';
import DetailedInsightModal from './DetailedInsightModal';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;

const DailyInsightCard = ({ date, onInsightLoaded }) => {
  const [insight, setInsight] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDetailedModal, setShowDetailedModal] = useState(false);

  const fetchInsight = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const params = date ? { date } : {};
      const response = await axios.get(`${API}/insights/daily`, {
        params,
        withCredentials: true,
        timeout: 8000 // Reduced timeout
      });
      const insightData = response.data;
      setInsight(insightData);
      // Notify parent component
      if (onInsightLoaded) {
        onInsightLoaded(insightData);
      }
    } catch (err) {
      console.error('Error fetching daily insight:', err);
      setError(err.response?.data?.detail || 'Failed to load insight');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInsight();
  }, [date]);

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

  if (isLoading) {
    return (
      <Card className="bg-white/80 dark:bg-[#112334] backdrop-blur-sm border-0 dark:border-[rgba(255,255,255,0.05)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] shadow-md rounded-2xl">
        <CardContent className="p-8">
          <div className="space-y-3">
            {/* Skeleton lines */}
            <div className="h-6 bg-gray-200 dark:bg-slate-700 rounded w-3/4 animate-pulse"></div>
            <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-full animate-pulse"></div>
            <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-5/6 animate-pulse"></div>
            <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-2/3 animate-pulse"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white/80 dark:bg-[#112334] backdrop-blur-sm border-0 dark:border-[rgba(255,255,255,0.05)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] shadow-md rounded-2xl">
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <p className="text-sm text-gray-600 dark:text-slate-400">
              We couldn't generate today's insight. Try refreshing.
            </p>
            <Button
              onClick={fetchInsight}
              size="sm"
              variant="ghost"
              className="ml-3 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!insight) {
    return null;
  }

  const isPositive = insight.changePct >= 0;
  const changeColor = isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
  const changeBgColor = isPositive 
    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' 
    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
  const concentrationPct = insight.attribution?.concentration?.topHoldingPct?.toFixed(0) || 0;

  return (
    <Card className="bg-white/80 dark:bg-gradient-to-br dark:from-[#12293F] dark:to-[#0F1E30] backdrop-blur-sm border-0 dark:border-[rgba(255,255,255,0.05)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] shadow-md rounded-2xl">
      <CardContent className="p-8">
        <div className="flex items-start justify-between gap-4">
          {/* Left: Main Narrative */}
          <div className="flex-1 space-y-3">
            {/* Line 1: Bold headline */}
            <p className="text-lg font-bold text-gray-900 dark:text-slate-200">
              {insight.headline || `Your portfolio ${isPositive ? 'rose' : 'fell'} ${formatPercent(Math.abs(insight.changePct))} today.`}
            </p>
            
            {/* Line 2: Narrative explanation */}
            <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
              {insight.details}
            </p>
            
            {/* Spacer line: Concentration */}
            {insight.attribution?.concentration && (
              <p className="text-xs text-gray-600 dark:text-slate-400 pt-2 border-t border-gray-200 dark:border-[rgba(255,255,255,0.04)]">
                Concentration: {concentrationPct}%
              </p>
            )}
          </div>

          {/* Right: Badge with today's change - with glow effect */}
          <div className={`px-4 py-3 rounded-lg border ${changeBgColor} flex-shrink-0 text-center min-w-[100px] dark:shadow-[0_0_12px_rgba(16,185,129,0.3)]`}>
            <div className={`text-lg font-bold ${changeColor} mb-1`}>
              {formatPercent(insight.changePct)}
            </div>
            <div className={`text-sm font-medium ${changeColor} opacity-90`}>
              {formatCurrency(insight.changeValue)}
            </div>
          </div>
        </div>

        {/* Explain More Button */}
        <div className="flex justify-end pt-4 mt-4 border-t border-gray-200 dark:border-[rgba(255,255,255,0.04)]">
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-700 dark:text-slate-300 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-opacity-80 dark:hover:-translate-y-0.5 transition-all duration-200"
            onClick={() => setShowDetailedModal(true)}
          >
            <span>Explain More</span>
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </CardContent>

      {/* Detailed Insight Modal */}
      <DetailedInsightModal
        open={showDetailedModal}
        onClose={() => setShowDetailedModal(false)}
        insight={insight}
      />
    </Card>
  );
};

export default DailyInsightCard;

