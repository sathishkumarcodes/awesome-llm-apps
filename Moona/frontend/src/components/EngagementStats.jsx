import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Calendar, Clock, TrendingUp, Flame } from 'lucide-react';

const EngagementStats = () => {
  const [stats, setStats] = useState({
    loginStreak: 0,
    totalLogins: 0,
    daysActive: 0,
    lastLogin: null
  });

  useEffect(() => {
    // Load engagement stats from localStorage
    const today = new Date().toDateString();
    const lastLogin = localStorage.getItem('moona_last_login');
    const loginHistory = JSON.parse(localStorage.getItem('moona_login_history') || '[]');
    const accountCreated = localStorage.getItem('moona_account_created');
    
    // Calculate streak
    let streak = 0;
    if (lastLogin === today) {
      // Check consecutive days
      const sortedDates = [...new Set(loginHistory)].sort((a, b) => new Date(b) - new Date(a));
      let currentStreak = 0;
      let checkDate = new Date();
      
      for (let i = 0; i < sortedDates.length; i++) {
        const loginDate = new Date(sortedDates[i]);
        const daysDiff = Math.floor((checkDate - loginDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === currentStreak) {
          currentStreak++;
          checkDate = new Date(loginDate);
        } else {
          break;
        }
      }
      streak = currentStreak;
    }

    // Calculate days active
    const uniqueDays = new Set(loginHistory).size;
    const daysSinceCreation = accountCreated 
      ? Math.floor((Date.now() - parseInt(accountCreated)) / (1000 * 60 * 60 * 24))
      : 0;

    setStats({
      loginStreak: streak,
      totalLogins: loginHistory.length,
      daysActive: uniqueDays,
      lastLogin: lastLogin
    });

    // Update login history
    if (lastLogin !== today) {
      const updatedHistory = [...loginHistory, today].slice(-30); // Keep last 30 days
      localStorage.setItem('moona_login_history', JSON.stringify(updatedHistory));
      localStorage.setItem('moona_last_login', today);
    }
  }, []);

  if (stats.loginStreak === 0 && stats.totalLogins === 0) return null;

  return (
    <Card className="bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {stats.loginStreak > 0 && (
              <div className="flex items-center space-x-2">
                <Flame className="w-5 h-5 text-orange-600" />
                <div>
                  <p className="text-xs text-gray-600">Login Streak</p>
                  <p className="text-lg font-bold text-orange-600">{stats.loginStreak} days</p>
                </div>
              </div>
            )}
            <div className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-xs text-gray-600">Days Active</p>
                <p className="text-lg font-bold text-blue-600">{stats.daysActive}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-xs text-gray-600">Total Logins</p>
                <p className="text-lg font-bold text-emerald-600">{stats.totalLogins}</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EngagementStats;

