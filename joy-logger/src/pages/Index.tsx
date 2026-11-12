import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { JournalPrompt } from "@/components/JournalPrompt";
import { StreakCounter } from "@/components/StreakCounter";
import { EntryHistory } from "@/components/EntryHistory";
import { LifeInsight } from "@/components/LifeInsight";
import { MemoryResurfacing } from "@/components/MemoryResurfacing";
import { SocialShare } from "@/components/SocialShare";
import { ShareableReflectionCard } from "@/components/ShareableReflectionCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Settings, LogOut, BarChart3, Calendar, Sparkles, Share2 } from "lucide-react";
import { JourneySummary } from "@/components/JourneySummary";

const Index = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<any[]>([]);
  const [streak, setStreak] = useState(0);
  const [hasEntryToday, setHasEntryToday] = useState(false);
  const [todayEntry, setTodayEntry] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showShareableCard, setShowShareableCard] = useState(false);

  const calculateStreak = (entries: any[]) => {
    if (entries.length === 0) return 0;

    const sortedEntries = [...entries].sort(
      (a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
    );

    let currentStreak = 0;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (let i = 0; i < sortedEntries.length; i++) {
      const entryDateStr = sortedEntries[i].entry_date; // YYYY-MM-DD format
      const [year, month, day] = entryDateStr.split('-').map(Number);
      const entryDate = new Date(year, month - 1, day);

      const expectedDate = new Date(today);
      expectedDate.setDate(today.getDate() - currentStreak);

      if (entryDate.getTime() === expectedDate.getTime()) {
        currentStreak++;
      } else {
        break;
      }
    }

    return currentStreak;
  };

  const fetchEntries = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("journal_entries")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setEntries(data || []);
      
      // Check if there's an entry today (using local date, not UTC)
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const todayEntryData = data?.find(entry => entry.entry_date === today);
      setHasEntryToday(!!todayEntryData);
      setTodayEntry(todayEntryData || null);

      // Calculate streak
      const currentStreak = calculateStreak(data || []);
      setStreak(currentStreak);
    } catch (error) {
      console.error("Error fetching entries:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        navigate("/auth");
      } else {
        fetchEntries();
      }
    }
  }, [user, authLoading, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-accent/20 to-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-ivory to-background">
      <div className="container max-w-4xl mx-auto px-4 py-8 sm:py-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-12 animate-fade-up">
          <div>
            <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-sunrise bg-clip-text text-transparent mb-2">
              OneGoodThing
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base">Find a little light in your day ☀️</p>
          </div>
          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/timeline")}
                  className="hover:bg-card/50 hover:scale-110 transition-all"
                >
                  <Calendar className="w-5 h-5 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Timeline</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/insights")}
                  className="hover:bg-card/50 hover:scale-110 transition-all"
                >
                  <Sparkles className="w-5 h-5 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Insights</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/stats")}
                  className="hover:bg-card/50 hover:scale-110 transition-all"
                >
                  <BarChart3 className="w-5 h-5 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Stats</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/settings")}
                  className="hover:bg-card/50 hover:scale-110 transition-all"
                >
                  <Settings className="w-5 h-5 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Settings</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSignOut}
                  className="hover:bg-card/50 hover:scale-110 transition-all"
                >
                  <LogOut className="w-5 h-5 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Logout</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="space-y-12">

          {/* Hero: Streak Counter */}
          <div className="animate-fade-up">
            <StreakCounter streak={streak} />
          </div>

          {/* Today's Reflection - Journal Prompt */}
          <div className="animate-fade-up" style={{ animationDelay: "0.1s", animationFillMode: "both" }}>
            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-foreground">Today's Reflection</h2>
              {entries.length === 0 ? (
                <Card className="border-primary/20 bg-gradient-to-br from-primary-soft/20 to-blush/10 p-6 mb-4">
                  <div className="space-y-3">
                    <p className="text-lg font-medium text-foreground">
                      ✨ Welcome! Ready to capture your first moment?
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      Take just 30 seconds to write about one good thing from today. You'll be surprised how much difference this simple practice makes — we promise you'll see it! 🌅
                    </p>
                  </div>
                </Card>
              ) : (
                <p className="text-muted-foreground">What brought you joy today?</p>
              )}
            </div>
            <div className="mt-4">
              <JournalPrompt 
                onEntrySubmitted={fetchEntries}
                hasEntryToday={hasEntryToday}
                userId={user.id}
              />
            </div>
          </div>

          {/* Shareable Card CTA - Show after entry is submitted */}
          {todayEntry && (
            <div className="animate-fade-up" style={{ animationDelay: "0.15s", animationFillMode: "both" }}>
              <Card className="relative overflow-hidden border-0 shadow-warm bg-gradient-to-br from-primary-soft/30 via-peach/20 to-blush/30">
                {/* Shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent bg-[length:200%_100%] animate-shimmer" />
                
                <div className="relative p-8 sm:p-10 flex flex-col items-center gap-6 text-center">
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-3">
                      <Sparkles className="w-7 h-7 text-primary animate-pulse" />
                      <h3 className="font-bold text-3xl bg-gradient-sunrise bg-clip-text text-transparent">
                        Turn This Into Something Beautiful
                      </h3>
                      <Sparkles className="w-7 h-7 text-primary animate-pulse" />
                    </div>
                    <p className="text-lg text-foreground/70 max-w-xl mx-auto leading-relaxed">
                      Transform today's moment into a stunning shareable card — perfect for Instagram Stories, Messages, or just keeping for yourself ✨
                    </p>
                  </div>
                  <Button 
                    onClick={() => setShowShareableCard(true)}
                    size="lg"
                    className="gap-3 text-lg px-10 py-7 shadow-warm hover:shadow-glow hover:scale-105 transition-all bg-gradient-sunrise border-0"
                  >
                    <Share2 className="w-5 h-5" />
                    Create Shareable Card
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* AI Insight */}
          {entries.length >= 1 && (
            <div className="animate-fade-up" style={{ animationDelay: "0.2s", animationFillMode: "both" }}>
              <LifeInsight userId={user.id} entriesCount={entries.length} />
            </div>
          )}

          {/* Memory Resurfacing */}
          {entries.length >= 5 && (
            <div className="animate-fade-up" style={{ animationDelay: "0.25s", animationFillMode: "both" }}>
              <MemoryResurfacing userId={user.id} />
            </div>
          )}

          {/* Journey Insights */}
          {entries.length >= 3 && (
            <div className="animate-fade-up" style={{ animationDelay: "0.3s", animationFillMode: "both" }}>
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-foreground">Your Journey Insights</h2>
                <JourneySummary totalEntries={entries.length} onViewStats={() => navigate("/stats")} />
              </div>
            </div>
          )}

          {/* Moments You've Saved */}
          <div className="animate-fade-up" style={{ animationDelay: "0.35s", animationFillMode: "both" }}>
            <EntryHistory entries={entries} onUpdate={fetchEntries} />
          </div>

          {/* Social Share - Bottom */}
          {todayEntry && (
            <div className="animate-fade-up" style={{ animationDelay: "0.4s", animationFillMode: "both" }}>
              <SocialShare 
                streak={streak} 
                todayEntry={todayEntry.entry_text}
                todayMood={todayEntry.mood_score || 3}
              />
            </div>
          )}
        </div>
      </div>

      {/* Shareable Card Dialog */}
      <Dialog open={showShareableCard} onOpenChange={setShowShareableCard}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Your Shareable Moment
            </DialogTitle>
          </DialogHeader>
          {todayEntry && (
            <ShareableReflectionCard
              entryText={todayEntry.entry_text}
              date={todayEntry.entry_date}
              mood={todayEntry.mood_score}
              onClose={() => setShowShareableCard(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;