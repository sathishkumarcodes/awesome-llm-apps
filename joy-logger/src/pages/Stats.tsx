import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, TrendingUp, Calendar, Zap, Smile, Sparkles } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, subMonths, differenceInDays, parseISO, subDays } from "date-fns";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface JournalEntry {
  id: string;
  entry_date: string;
  mood_score: number | null;
  entry_text: string;
  ai_reflection: string | null;
  tags?: string[] | null;
  photo_url?: string | null;
}

const Stats = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [totalDays, setTotalDays] = useState(0);
  const [timeRange, setTimeRange] = useState<7 | 30 | 60 | 90>(30);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);

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
      calculateStats(data || []);
    } catch (error) {
      console.error("Error loading entries:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (entries: JournalEntry[]) => {
    if (entries.length === 0) return;

    setTotalDays(entries.length);

    // Calculate streaks
    const dates = entries.map(e => e.entry_date).sort();
    let current = 0;
    let longest = 0;
    let temp = 1;

    const today = format(new Date(), "yyyy-MM-dd");
    const yesterday = format(new Date(Date.now() - 86400000), "yyyy-MM-dd");

    // Check if last entry is today or yesterday for current streak
    const lastEntry = dates[dates.length - 1];
    if (lastEntry === today || lastEntry === yesterday) {
      current = 1;
      
      for (let i = dates.length - 2; i >= 0; i--) {
        const prevDate = new Date(dates[i]);
        const currDate = new Date(dates[i + 1]);
        const diff = differenceInDays(currDate, prevDate);
        
        if (diff === 1) {
          current++;
        } else {
          break;
        }
      }
    }

    // Calculate longest streak
    for (let i = 1; i < dates.length; i++) {
      const prevDate = new Date(dates[i - 1]);
      const currDate = new Date(dates[i]);
      const diff = differenceInDays(currDate, prevDate);
      
      if (diff === 1) {
        temp++;
      } else {
        longest = Math.max(longest, temp);
        temp = 1;
      }
    }
    longest = Math.max(longest, temp);

    setCurrentStreak(current);
    setLongestStreak(longest);
  };

  const getHeatmapData = () => {
    const today = new Date();
    const startDate = subDays(today, timeRange - 1);
    const days = eachDayOfInterval({ start: startDate, end: today });

    return days.map(day => {
      const dayString = format(day, 'yyyy-MM-dd');
      const entry = entries.find(e => e.entry_date === dayString);
      
      return {
        date: day,
        hasEntry: !!entry,
        moodScore: entry?.mood_score || null,
        entry: entry || null
      };
    });
  };

  const getMoodChartData = () => {
    const today = new Date();
    const daysToShow = Math.min(timeRange, 30); // Show max 30 days on chart for readability
    
    const chartData = Array.from({ length: daysToShow }, (_, i) => {
      const date = subDays(today, daysToShow - 1 - i);
      const dateString = format(date, 'yyyy-MM-dd');
      const entry = entries.find(e => e.entry_date === dateString);
      
      return {
        date: format(date, 'MMM d'),
        mood: entry?.mood_score || null,
        hasEntry: !!entry
      };
    });
    
    return chartData;
  };

  const getMoodIntensityColor = (score: number | null) => {
    if (score === null) return "bg-muted";
    
    // Map mood scores (1-5) to color intensities
    if (score === 1) return "bg-destructive/40";
    if (score === 2) return "bg-primary/30";
    if (score === 3) return "bg-primary/50";
    if (score === 4) return "bg-primary/70";
    return "bg-primary";
  };

  const getTimeRangeLabel = () => {
    if (timeRange === 7) return "Last 7 Days";
    if (timeRange === 30) return "Last Month";
    if (timeRange === 60) return "Last 2 Months";
    return "Last 3 Months";
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-accent/20 to-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const heatmapData = getHeatmapData();
  const moodChartData = getMoodChartData();
  const avgMood = entries.filter(e => e.mood_score).length > 0
    ? (entries.reduce((sum, e) => sum + (e.mood_score || 0), 0) / entries.filter(e => e.mood_score).length).toFixed(1)
    : "N/A";

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/20 to-background">
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-3xl font-bold text-foreground">Your Stats</h1>
          </div>

          {/* Key Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <Zap className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-medium text-muted-foreground">Current Streak</h3>
              </div>
              <p className="text-3xl font-bold text-foreground">{currentStreak}</p>
              <p className="text-sm text-muted-foreground mt-1">days in a row</p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-medium text-muted-foreground">Longest Streak</h3>
              </div>
              <p className="text-3xl font-bold text-foreground">{longestStreak}</p>
              <p className="text-sm text-muted-foreground mt-1">personal best</p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <Calendar className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-medium text-muted-foreground">Total Days</h3>
              </div>
              <p className="text-3xl font-bold text-foreground">{totalDays}</p>
              <p className="text-sm text-muted-foreground mt-1">entries logged</p>
            </Card>
          </div>

          {/* Average Mood */}
          <Card className="p-6 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
            <div className="flex items-center gap-3 mb-2">
              <Smile className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-medium text-muted-foreground">Average Mood</h3>
            </div>
            <p className="text-3xl font-bold text-foreground">{avgMood}</p>
            <p className="text-sm text-muted-foreground mt-1">out of 5</p>
          </Card>

          {/* Time Range Filters */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Time Range:</span>
              <div className="flex gap-2">
                {[
                  { value: 7, label: "7D" },
                  { value: 30, label: "1M" },
                  { value: 60, label: "2M" },
                  { value: 90, label: "3M" }
                ].map(option => (
                  <Button
                    key={option.value}
                    variant={timeRange === option.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTimeRange(option.value as 7 | 30 | 60 | 90)}
                    className="min-w-[60px]"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </Card>

          {/* Mood Trend Chart */}
          {entries.length > 0 && (
            <Card className="p-6 bg-gradient-to-br from-primary/5 via-transparent to-primary/5">
              <h3 className="text-xl font-semibold text-foreground mb-2">
                Mood Journey {timeRange <= 30 ? `(Last ${timeRange} Days)` : `(Last ${Math.min(timeRange, 30)} Days)`}
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                {entries.filter(e => e.mood_score).length} entries with mood tracked
              </p>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={moodChartData}>
                  <defs>
                    <linearGradient id="moodGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    domain={[0, 5]} 
                    ticks={[1, 2, 3, 4, 5]}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    label={{ value: 'Mood', angle: -90, position: 'insideLeft', style: { fill: 'hsl(var(--muted-foreground))' } }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '2px solid hsl(var(--primary))',
                      borderRadius: '12px',
                      padding: '12px',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
                    }}
                    formatter={(value: any) => {
                      if (!value) return ['No entry', ''];
                      const emoji = value === 1 ? "😢" : value === 2 ? "😕" : value === 3 ? "🙂" : value === 4 ? "😌" : "😄";
                      const label = value === 1 ? "Rough" : value === 2 ? "Meh" : value === 3 ? "Okay" : value === 4 ? "Good" : "Great";
                      return [`${emoji} ${label} (${value}/5)`, 'Mood'];
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="mood" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={3}
                    fill="url(#moodGradient)"
                    connectNulls
                    dot={{ 
                      fill: 'hsl(var(--primary))', 
                      strokeWidth: 2, 
                      r: 5,
                      stroke: 'hsl(var(--background))'
                    }}
                    activeDot={{ 
                      r: 8, 
                      fill: 'hsl(var(--primary))',
                      stroke: 'hsl(var(--background))',
                      strokeWidth: 3
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Track your emotional patterns over time
                </p>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-primary" />
                    <span className="text-muted-foreground">Entry logged</span>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Activity Heatmap */}
          <Card className="p-6">
            <h3 className="text-xl font-semibold text-foreground mb-4">Activity & Mood Calendar</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {getTimeRangeLabel()} • <span className="text-primary font-medium">Click colored dates to view your entry</span>
            </p>
            <div className={`grid gap-2 ${timeRange === 7 ? 'grid-cols-7' : 'grid-cols-7'}`}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-xs text-center text-muted-foreground font-medium mb-1">
                  {day}
                </div>
              ))}
              {heatmapData.map((day, idx) => {
                const isToday = isSameDay(day.date, new Date());
                const moodEmoji = day.moodScore === 1 ? "😢" : day.moodScore === 2 ? "😕" : day.moodScore === 3 ? "🙂" : day.moodScore === 4 ? "😌" : day.moodScore === 5 ? "😄" : "";
                const dateFormatted = format(day.date, 'MM/dd/yyyy');
                const hasEntry = day.hasEntry;
                
                return (
                  <button
                    key={`${day.date.toISOString()}-${idx}`}
                    onClick={(e) => {
                      e.preventDefault();
                      if (day.entry) {
                        setSelectedEntry(day.entry);
                      }
                    }}
                    type="button"
                    disabled={!hasEntry}
                    className={`
                      relative aspect-square rounded-lg transition-all duration-200
                      flex flex-col items-center justify-center gap-0.5 p-2
                      ${hasEntry 
                        ? `${getMoodIntensityColor(day.moodScore)} hover:scale-110 hover:shadow-glow cursor-pointer border-2 border-primary/20 hover:border-primary active:scale-95` 
                        : 'bg-muted/30 border-2 border-muted cursor-not-allowed opacity-60'
                      }
                      ${isToday ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
                    `}
                    title={hasEntry ? `${dateFormatted}\n\n"${day.entry?.entry_text}"\n\nMood: ${moodEmoji} Click to view full entry` : `${dateFormatted}\nNo entry this day`}
                  >
                    <span className={`text-[9px] font-bold pointer-events-none ${hasEntry ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {format(day.date, 'M/d')}
                    </span>
                    {hasEntry && moodEmoji && (
                      <span className="text-base leading-none mt-0.5 pointer-events-none">{moodEmoji}</span>
                    )}
                    {hasEntry && (
                      <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-primary rounded-full animate-pulse pointer-events-none" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Mood Scale:</span>
                  <div className="flex gap-1 items-center">
                    <div className="w-4 h-4 rounded-sm bg-destructive/40 border border-destructive/50" title="1 - Rough 😢" />
                    <div className="w-4 h-4 rounded-sm bg-primary/30 border border-primary/40" title="2 - Meh 😕" />
                    <div className="w-4 h-4 rounded-sm bg-primary/50 border border-primary/60" title="3 - Okay 🙂" />
                    <div className="w-4 h-4 rounded-sm bg-primary/70 border border-primary/80" title="4 - Good 😌" />
                    <div className="w-4 h-4 rounded-sm bg-primary border border-primary" title="5 - Great 😄" />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-4 h-4 rounded-sm bg-muted/30 border-2 border-muted" />
                <span>No entry</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Entry Detail Dialog */}
        <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-2xl">
                <Calendar className="w-6 h-6 text-primary" />
                {selectedEntry && format(parseISO(selectedEntry.entry_date), 'EEEE, MMMM d, yyyy')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6 pt-4">
              {selectedEntry?.photo_url && (
                <img 
                  src={selectedEntry.photo_url} 
                  alt="Journal moment" 
                  className="w-full h-64 object-cover rounded-lg"
                />
              )}
              
              {selectedEntry?.mood_score && (
                <div className="flex items-center gap-3 p-4 bg-primary/10 rounded-lg border border-primary/20">
                  <span className="text-4xl">
                    {selectedEntry.mood_score === 1 ? "😢" : 
                     selectedEntry.mood_score === 2 ? "😕" : 
                     selectedEntry.mood_score === 3 ? "🙂" : 
                     selectedEntry.mood_score === 4 ? "😌" : "😄"}
                  </span>
                  <div>
                    <p className="text-sm text-muted-foreground">How you felt</p>
                    <p className="text-lg font-semibold text-foreground">
                      {selectedEntry.mood_score === 1 ? "Rough Day" : 
                       selectedEntry.mood_score === 2 ? "Meh" : 
                       selectedEntry.mood_score === 3 ? "Okay" : 
                       selectedEntry.mood_score === 4 ? "Good Day" : "Great Day!"}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Your Good Thing</p>
                <p className="text-xl text-foreground leading-relaxed font-medium">
                  {selectedEntry?.entry_text}
                </p>
              </div>

              {selectedEntry?.tags && selectedEntry.tags.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedEntry.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedEntry?.ai_reflection && (
                <div className="pt-4 border-t border-border">
                  <div className="flex items-start gap-3 p-4 bg-accent/30 rounded-lg">
                    <Sparkles className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">AI Reflection</p>
                      <p className="text-base text-muted-foreground italic leading-relaxed">
                        {selectedEntry.ai_reflection}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Stats;
