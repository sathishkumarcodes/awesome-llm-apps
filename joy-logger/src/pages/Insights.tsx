import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, TrendingUp, Calendar, Heart, Sparkles, Loader2 } from "lucide-react";
import { format, parseISO, subDays, startOfWeek } from "date-fns";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface JournalEntry {
  id: string;
  entry_date: string;
  mood_score: number | null;
  entry_text: string;
  tags?: string[] | null;
  photo_url?: string | null;
}

const Insights = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<JournalEntry[]>([]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    } else if (user) {
      loadEntries();
    }
  }, [user, authLoading, navigate]);

  const loadEntries = async () => {
    try {
      const { data, error } = await supabase
        .from("journal_entries")
        .select("*")
        .eq("user_id", user?.id)
        .order("entry_date", { ascending: true });

      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error("Error loading entries:", error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate insights
  const recentEntries = entries.filter(e => {
    const entryDate = parseISO(e.entry_date);
    const thirtyDaysAgo = subDays(new Date(), 30);
    return entryDate >= thirtyDaysAgo;
  });

  const avgMood = recentEntries.length > 0
    ? recentEntries.reduce((sum, e) => sum + (e.mood_score || 0), 0) / recentEntries.length
    : 0;

  // Day of week analysis
  const dayOfWeekMoods: { [key: string]: number[] } = {};
  recentEntries.forEach(entry => {
    const day = format(parseISO(entry.entry_date), 'EEEE');
    if (!dayOfWeekMoods[day]) dayOfWeekMoods[day] = [];
    if (entry.mood_score) dayOfWeekMoods[day].push(entry.mood_score);
  });

  const happiestDay = Object.entries(dayOfWeekMoods)
    .map(([day, moods]) => ({
      day,
      avg: moods.reduce((sum, m) => sum + m, 0) / moods.length
    }))
    .sort((a, b) => b.avg - a.avg)[0];

  // Theme analysis
  const themeCounts: { [key: string]: number } = {};
  recentEntries.forEach(entry => {
    entry.tags?.forEach(tag => {
      themeCounts[tag] = (themeCounts[tag] || 0) + 1;
    });
  });

  const topThemes = Object.entries(themeCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const strongestTheme = topThemes[0];

  // Mood chart data (last 30 days)
  const moodChartData = recentEntries
    .filter(e => e.mood_score)
    .map(e => ({
      date: format(parseISO(e.entry_date), 'MMM d'),
      mood: e.mood_score
    }));

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Analyzing your journey...</p>
        </div>
      </div>
    );
  }

  if (entries.length < 3) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-accent/20 to-background">
        <div className="container max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-3xl font-bold text-foreground">Insights</h1>
          </div>
          <Card className="p-12 text-center">
            <Sparkles className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Keep Journaling
            </h3>
            <p className="text-muted-foreground">
              Add at least 3 entries to unlock personalized insights about your journey
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/20 to-background">
      <div className="container max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Your Insights</h1>
            <p className="text-sm text-muted-foreground">Based on your last 30 days</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Key Insights Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {happiestDay && (
              <Card className="p-6 bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-primary/20 rounded-lg">
                    <Calendar className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">You're happiest on</p>
                    <p className="text-2xl font-bold text-foreground">{happiestDay.day}s</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Avg mood: {happiestDay.avg.toFixed(1)}/5
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {strongestTheme && (
              <Card className="p-6 bg-gradient-to-br from-accent/30 to-transparent border-accent/20">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-accent/40 rounded-lg">
                    <Heart className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Your strongest joy theme</p>
                    <p className="text-2xl font-bold text-foreground">{strongestTheme[0]}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {strongestTheme[1]} moments
                    </p>
                  </div>
                </div>
              </Card>
            )}

            <Card className="p-6 bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-primary/20 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Average mood this month</p>
                  <p className="text-2xl font-bold text-foreground">{avgMood.toFixed(1)}/5</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {avgMood >= 4 ? "You're doing great! 🌟" : avgMood >= 3 ? "Keep it up! 💪" : "Be kind to yourself ❤️"}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-accent/30 to-transparent border-accent/20">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-accent/40 rounded-lg">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Moments captured</p>
                  <p className="text-2xl font-bold text-foreground">{recentEntries.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Last 30 days
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Mood Trend Chart */}
          {moodChartData.length > 2 && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Joy Level Across the Month</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={moodChartData}>
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis 
                    domain={[1, 5]}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="mood" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Themes & Patterns */}
          {topThemes.length > 0 && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Themes & Patterns</h3>
              <div className="space-y-4">
                {topThemes.map(([theme, count]) => (
                  <div key={theme} className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-sm">{theme}</Badge>
                    <div className="flex items-center gap-3">
                      <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${(count / recentEntries.length) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground w-12 text-right">
                        {count} {count === 1 ? 'time' : 'times'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* View Monthly Reflection CTA */}
          <Card className="p-8 text-center bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
            <Sparkles className="w-12 h-12 mx-auto mb-4 text-primary" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Ready for a deeper reflection?
            </h3>
            <p className="text-muted-foreground mb-4">
              View your AI-generated monthly reflection with personalized insights
            </p>
            <Button onClick={() => navigate("/reflection")}>
              View Monthly Reflection
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Insights;
