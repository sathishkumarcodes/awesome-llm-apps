import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Trophy, Target, TrendingUp, Sparkles, CheckCircle2 } from 'lucide-react';

const MilestoneTracker = ({ portfolioValue, costBasis, returnPct }) => {
  const [milestones, setMilestones] = useState([]);
  const [recentAchievement, setRecentAchievement] = useState(null);

  useEffect(() => {
    if (!portfolioValue || !costBasis) return;

    const allMilestones = [
      { type: 'value', threshold: 10000, label: 'First $10K', icon: Trophy, color: 'emerald' },
      { type: 'value', threshold: 25000, label: '$25K Milestone', icon: Trophy, color: 'blue' },
      { type: 'value', threshold: 50000, label: '$50K Milestone', icon: Trophy, color: 'purple' },
      { type: 'value', threshold: 100000, label: '$100K Club', icon: Trophy, color: 'amber' },
      { type: 'value', threshold: 250000, label: '$250K Milestone', icon: Trophy, color: 'rose' },
      { type: 'value', threshold: 500000, label: '$500K Milestone', icon: Trophy, color: 'indigo' },
      { type: 'value', threshold: 1000000, label: 'Millionaire!', icon: Sparkles, color: 'yellow' },
      { type: 'return', threshold: 10, label: '10% Return', icon: TrendingUp, color: 'emerald' },
      { type: 'return', threshold: 25, label: '25% Return', icon: TrendingUp, color: 'blue' },
      { type: 'return', threshold: 50, label: '50% Return', icon: TrendingUp, color: 'purple' },
      { type: 'return', threshold: 100, label: '100% Return (Double!)', icon: Sparkles, color: 'amber' },
      { type: 'return', threshold: 200, label: '200% Return (Triple!)', icon: Sparkles, color: 'rose' },
    ];

    const achieved = allMilestones.filter(m => {
      if (m.type === 'value') {
        return portfolioValue >= m.threshold;
      } else {
        return returnPct >= m.threshold;
      }
    });

    const nextMilestone = allMilestones.find(m => {
      if (m.type === 'value') {
        return portfolioValue < m.threshold;
      } else {
        return returnPct < m.threshold;
      }
    });

    setMilestones(achieved);

    // Check for new achievements
    const storedAchievements = JSON.parse(localStorage.getItem('moona_achievements') || '[]');
    const newAchievement = achieved.find(a => 
      !storedAchievements.some(sa => sa.label === a.label)
    );

    if (newAchievement) {
      setRecentAchievement(newAchievement);
      localStorage.setItem('moona_achievements', JSON.stringify(achieved));
      
      // Auto-dismiss after 5 seconds
      setTimeout(() => setRecentAchievement(null), 5000);
    }

    // Store current achievements
    localStorage.setItem('moona_achievements', JSON.stringify(achieved));
  }, [portfolioValue, costBasis, returnPct]);

  if (milestones.length === 0 && !recentAchievement) {
    return null;
  }

  const getColorClasses = (color) => {
    const colors = {
      emerald: 'bg-emerald-100 text-emerald-700 border-emerald-300',
      blue: 'bg-blue-100 text-blue-700 border-blue-300',
      purple: 'bg-purple-100 text-purple-700 border-purple-300',
      amber: 'bg-amber-100 text-amber-700 border-amber-300',
      rose: 'bg-rose-100 text-rose-700 border-rose-300',
      indigo: 'bg-indigo-100 text-indigo-700 border-indigo-300',
      yellow: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    };
    return colors[color] || colors.emerald;
  };

  return (
    <>
      {/* Achievement Celebration */}
      {recentAchievement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-black/50 backdrop-blur-sm absolute inset-0 pointer-events-auto" onClick={() => setRecentAchievement(null)} />
          <Card className="relative z-10 bg-gradient-to-br from-white to-gray-50 border-2 border-yellow-400 shadow-2xl animate-bounce-in max-w-md mx-4">
            <CardContent className="p-8 text-center">
              <div className="mb-4 flex justify-center">
                <div className="relative">
                  <Sparkles className="w-16 h-16 text-yellow-500 animate-pulse" />
                  <Trophy className="w-12 h-12 text-yellow-600 absolute top-2 left-2" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">🎉 Achievement Unlocked!</h3>
              <p className="text-xl font-semibold text-gray-700 mb-4">{recentAchievement.label}</p>
              <p className="text-sm text-gray-600">Keep up the great work!</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Milestone Badges */}
      {milestones.length > 0 && (
        <Card className="bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200 shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Trophy className="w-5 h-5 text-amber-600" />
                <span className="text-sm font-semibold text-gray-800">Achievements</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {milestones.slice(-3).map((milestone, idx) => {
                  const Icon = milestone.icon;
                  return (
                    <Badge
                      key={idx}
                      className={`${getColorClasses(milestone.color)} border flex items-center space-x-1 px-2 py-1`}
                    >
                      <Icon className="w-3 h-3" />
                      <span className="text-xs font-medium">{milestone.label}</span>
                    </Badge>
                  );
                })}
                {milestones.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{milestones.length - 3} more
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
};

export default MilestoneTracker;

