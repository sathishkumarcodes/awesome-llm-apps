import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Sparkles, Calendar, TrendingUp, Loader2, ChevronLeft, ChevronRight, Share2 } from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { toast } from "sonner";

interface MonthlyReflection {
  summary: string;
  highlights: string[];
  themes: { [key: string]: number };
  joyStats: {
    daysTracked: number;
    avgMood: number;
    positivity: string;
  };
}

const MonthlyReflection = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [reflection, setReflection] = useState<MonthlyReflection | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(subMonths(new Date(), 1));
  const [entriesCount, setEntriesCount] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    } else if (user) {
      loadMonthData();
    }
  }, [user, authLoading, navigate, selectedMonth]);

  const loadMonthData = async () => {
    try {
      setLoading(true);
      const monthStart = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from("journal_entries")
        .select("*")
        .eq("user_id", user?.id)
        .gte("entry_date", monthStart)
        .lte("entry_date", monthEnd);

      if (error) throw error;

      setEntriesCount(data?.length || 0);

      if ((data?.length || 0) < 3) {
        setReflection(null);
      }
    } catch (error) {
      console.error("Error loading month data:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateReflection = async () => {
    if (entriesCount < 3) {
      toast.error("Need at least 3 entries to generate a reflection");
      return;
    }

    setGenerating(true);
    try {
      const monthStart = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');

      const { data, error } = await supabase.functions.invoke('generate-monthly-reflection', {
        body: {
          monthStart,
          monthEnd
        }
      });

      if (error) throw error;

      if (data?.reflection) {
        setReflection(data.reflection);
        toast.success("Reflection generated!");
      }
    } catch (error: any) {
      console.error("Error generating reflection:", error);
      if (error.message?.includes('429')) {
        toast.error("Rate limit reached. Please try again later.");
      } else if (error.message?.includes('402')) {
        toast.error("AI service unavailable. Please try again later.");
      } else {
        toast.error("Failed to generate reflection");
      }
    } finally {
      setGenerating(false);
    }
  };

  const shareReflection = () => {
    const text = `My ${format(selectedMonth, 'MMMM yyyy')} reflection from OneGoodThing:\n\n${reflection?.summary}`;
    if (navigator.share) {
      navigator.share({ text });
    } else {
      navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard!");
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Loading reflection...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/20 to-background">
      <div className="container max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Monthly Reflection</h1>
              <p className="text-sm text-muted-foreground">Your journey in review</p>
            </div>
          </div>

          {reflection && (
            <Button variant="outline" onClick={shareReflection}>
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
          )}
        </div>

        {/* Month Selector */}
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground">
                {format(selectedMonth, 'MMMM yyyy')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {entriesCount} {entriesCount === 1 ? 'entry' : 'entries'} this month
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedMonth(subMonths(selectedMonth, -1))}
              disabled={selectedMonth >= subMonths(new Date(), 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>

        {/* Content */}
        {entriesCount < 3 ? (
          <Card className="p-12 text-center">
            <Calendar className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Not enough entries
            </h3>
            <p className="text-muted-foreground">
              Add at least 3 entries in {format(selectedMonth, 'MMMM')} to generate your reflection
            </p>
          </Card>
        ) : !reflection ? (
          <Card className="p-12 text-center">
            <Sparkles className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Generate Your Reflection
            </h3>
            <p className="text-muted-foreground mb-6">
              Create a personalized AI summary of your {format(selectedMonth, 'MMMM')} journey
            </p>
            <Button onClick={generateReflection} disabled={generating} size="lg">
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Reflection
                </>
              )}
            </Button>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Summary */}
            <Card className="p-8 bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
              <div className="flex items-start gap-4 mb-4">
                <Sparkles className="w-6 h-6 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">Your Month</h3>
                  <p className="text-base text-foreground/90 leading-relaxed">
                    {reflection.summary}
                  </p>
                </div>
              </div>
            </Card>

            {/* Joy Stats */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Your Joy Stats
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-accent/30 rounded-lg">
                  <div className="text-3xl font-bold text-foreground mb-1">
                    {reflection.joyStats.daysTracked}
                  </div>
                  <div className="text-sm text-muted-foreground">Days Captured</div>
                </div>
                <div className="text-center p-4 bg-accent/30 rounded-lg">
                  <div className="text-3xl font-bold text-foreground mb-1">
                    {reflection.joyStats.avgMood.toFixed(1)}
                  </div>
                  <div className="text-sm text-muted-foreground">Average Mood</div>
                </div>
                <div className="text-center p-4 bg-accent/30 rounded-lg">
                  <div className="text-lg font-semibold text-foreground mb-1">
                    {reflection.joyStats.positivity}
                  </div>
                  <div className="text-sm text-muted-foreground">Positivity</div>
                </div>
              </div>
            </Card>

            {/* Highlights */}
            {reflection.highlights.length > 0 && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Highlights</h3>
                <ul className="space-y-2">
                  {reflection.highlights.map((highlight, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-primary mt-1">✨</span>
                      <span className="text-foreground/90">{highlight}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Themes */}
            {Object.keys(reflection.themes).length > 0 && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Themes This Month</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(reflection.themes)
                    .sort(([, a], [, b]) => b - a)
                    .map(([theme, count]) => (
                      <Badge key={theme} variant="secondary" className="text-sm">
                        {theme} ({count})
                      </Badge>
                    ))}
                </div>
              </Card>
            )}

            {/* Regenerate Button */}
            <div className="text-center pt-4">
              <Button variant="outline" onClick={generateReflection} disabled={generating}>
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Regenerate Reflection
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MonthlyReflection;
