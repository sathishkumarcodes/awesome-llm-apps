import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { TrendingUp, TrendingDown, Zap, Target, Calendar, DollarSign } from 'lucide-react';

const QuickInsights = ({ portfolioSummary, holdings, lastUpdated }) => {
  const [insights, setInsights] = useState([]);

  useEffect(() => {
    if (!portfolioSummary || !holdings || holdings.length === 0) {
      setInsights([]);
      return;
    }

    const newInsights = [];

    // Portfolio value insights
    if (portfolioSummary.currentValue > 0) {
      const daysSinceStart = Math.floor((Date.now() - (localStorage.getItem('moona_account_created') ? parseInt(localStorage.getItem('moona_account_created')) : Date.now())) / (1000 * 60 * 60 * 24));
      if (daysSinceStart > 0) {
        const dailyGrowth = portfolioSummary.currentValue / daysSinceStart;
        if (dailyGrowth > 100) {
          newInsights.push({
            icon: Zap,
            color: 'emerald',
            title: 'Strong Growth',
            message: `Your portfolio is growing at ~$${Math.round(dailyGrowth).toLocaleString()}/day`,
            type: 'positive'
          });
        }
      }
    }

    // Return insights
    if (portfolioSummary.returnPct > 20) {
      newInsights.push({
        icon: TrendingUp,
        color: 'emerald',
        title: 'Outstanding Returns',
        message: `You're up ${portfolioSummary.returnPct.toFixed(1)}% - that's impressive!`,
        type: 'positive'
      });
    } else if (portfolioSummary.returnPct < -10) {
      newInsights.push({
        icon: TrendingDown,
        color: 'blue',
        title: 'Market Opportunity',
        message: 'Consider reviewing your allocation - markets are volatile',
        type: 'neutral'
      });
    }

    // Diversification insights
    if (portfolioSummary.assetTypeCount >= 3) {
      newInsights.push({
        icon: Target,
        color: 'purple',
        title: 'Well Diversified',
        message: `You have ${portfolioSummary.assetTypeCount} different asset types`,
        type: 'positive'
      });
    } else if (portfolioSummary.assetTypeCount === 1 && holdings.length > 1) {
      newInsights.push({
        icon: Target,
        color: 'amber',
        title: 'Diversification Tip',
        message: 'Consider adding different asset types to reduce risk',
        type: 'tip'
      });
    }

    // Holdings count insights
    if (holdings.length >= 10) {
      newInsights.push({
        icon: DollarSign,
        color: 'blue',
        title: 'Active Portfolio',
        message: `You're tracking ${holdings.length} holdings - great organization!`,
        type: 'positive'
      });
    }

    // Time-based insights
    const hour = new Date().getHours();
    if (hour >= 9 && hour <= 16) {
      newInsights.push({
        icon: Calendar,
        color: 'indigo',
        title: 'Market Hours',
        message: 'Markets are open - prices updating in real-time',
        type: 'info'
      });
    }

    setInsights(newInsights.slice(0, 3)); // Show max 3 insights
  }, [portfolioSummary, holdings, lastUpdated]);

  if (insights.length === 0) return null;

  const getColorClasses = (color, type) => {
    const baseColors = {
      emerald: type === 'positive' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-emerald-50',
      blue: 'bg-blue-50 border-blue-200 text-blue-800',
      purple: 'bg-purple-50 border-purple-200 text-purple-800',
      amber: 'bg-amber-50 border-amber-200 text-amber-800',
      indigo: 'bg-indigo-50 border-indigo-200 text-indigo-800',
    };
    return baseColors[color] || baseColors.blue;
  };

  return (
    <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200 shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-gray-800 flex items-center">
          <Zap className="w-4 h-4 mr-2 text-blue-600" />
          Quick Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {insights.map((insight, idx) => {
          const Icon = insight.icon;
          return (
            <div
              key={idx}
              className={`${getColorClasses(insight.color, insight.type)} border rounded-lg p-3 flex items-start space-x-3 animate-fade-in`}
              style={{ animationDelay: `${idx * 100}ms` }}
            >
              <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 text-${insight.color}-600`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold mb-1">{insight.title}</p>
                <p className="text-xs text-gray-700">{insight.message}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default QuickInsights;

