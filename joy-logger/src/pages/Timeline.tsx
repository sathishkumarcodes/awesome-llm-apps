import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Calendar, ChevronLeft, ChevronRight, Sparkles, List } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, parseISO, startOfWeek, endOfWeek } from "date-fns";
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

const Timeline = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');

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
        .order("entry_date", { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error("Error loading entries:", error);
    } finally {
      setLoading(false);
    }
  };

  const getEntryForDate = (date: Date) => {
    return entries.find(entry => 
      isSameDay(parseISO(entry.entry_date), date)
    );
  };

  const getMoodColor = (moodScore: number | null) => {
    if (!moodScore) return "bg-muted/30 border-muted";
    if (moodScore === 1) return "bg-destructive/40 border-destructive/50";
    if (moodScore === 2) return "bg-primary/30 border-primary/40";
    if (moodScore === 3) return "bg-primary/50 border-primary/60";
    if (moodScore === 4) return "bg-primary/70 border-primary/80";
    return "bg-primary border-primary";
  };

  const getMoodEmoji = (moodScore: number | null) => {
    if (!moodScore) return "";
    if (moodScore === 1) return "😢";
    if (moodScore === 2) return "😕";
    if (moodScore === 3) return "🙂";
    if (moodScore === 4) return "😌";
    return "😄";
  };

  const renderCalendarView = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    return (
      <div className="space-y-6">
        {/* Month Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-2xl font-bold text-foreground">
            {format(currentMonth, "MMMM yyyy")}
          </h2>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            disabled={currentMonth >= new Date()}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Calendar Grid */}
        <Card className="p-6">
          <div className="grid grid-cols-7 gap-2 mb-4">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
              <div key={day} className="text-center text-sm font-semibold text-muted-foreground py-2">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((day, index) => {
              const entry = getEntryForDate(day);
              const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
              const isToday = isSameDay(day, new Date());
              
              return (
                <button
                  key={index}
                  onClick={() => entry && setSelectedEntry(entry)}
                  disabled={!entry}
                  className={`
                    aspect-square p-2 rounded-lg border-2 transition-all
                    ${!isCurrentMonth ? "opacity-30" : ""}
                    ${isToday ? "ring-2 ring-primary ring-offset-2" : ""}
                    ${entry ? "cursor-pointer hover:scale-105" : "cursor-default"}
                    ${entry ? getMoodColor(entry.mood_score) : "border-muted/30"}
                  `}
                >
                  <div className="flex flex-col items-center justify-center h-full">
                    <span className={`text-sm font-medium ${!isCurrentMonth ? "text-muted-foreground" : "text-foreground"}`}>
                      {format(day, "d")}
                    </span>
                    {entry && (
                      <span className="text-lg mt-1">
                        {entry.mood_score ? getMoodEmoji(entry.mood_score) : "✨"}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-6 pt-6 border-t border-border/50 flex items-center justify-center gap-6 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-4 h-4 rounded-sm bg-muted/30 border-2 border-muted" />
              <span>No entry</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-4 h-4 rounded-sm bg-destructive/40 border-2 border-destructive/50" />
              <span>Rough 😢</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-4 h-4 rounded-sm bg-primary/50 border-2 border-primary/60" />
              <span>Okay 🙂</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-4 h-4 rounded-sm bg-primary border-2 border-primary" />
              <span>Great 😄</span>
            </div>
          </div>
        </Card>
      </div>
    );
  };

  const renderListView = () => {
    const monthEntries = entries.filter(entry => {
      const entryDate = parseISO(entry.entry_date);
      return entryDate.getMonth() === currentMonth.getMonth() &&
             entryDate.getFullYear() === currentMonth.getFullYear();
    });

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-2xl font-bold text-foreground">
            {format(currentMonth, "MMMM yyyy")}
          </h2>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            disabled={currentMonth >= new Date()}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-4">
          {monthEntries.length === 0 ? (
            <Card className="p-8 text-center">
              <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No entries this month</p>
            </Card>
          ) : (
            monthEntries.map((entry) => (
              <Card
                key={entry.id}
                className="p-6 hover:shadow-glow transition-all cursor-pointer"
                onClick={() => setSelectedEntry(entry)}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {format(parseISO(entry.entry_date), "EEEE, MMMM d")}
                    </span>
                    {entry.mood_score && (
                      <span className="text-2xl">{getMoodEmoji(entry.mood_score)}</span>
                    )}
                  </div>
                  <p className="text-foreground font-medium line-clamp-2">{entry.entry_text}</p>
                  {entry.tags && entry.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {entry.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {entry.tags.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{entry.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    );
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground">Loading timeline...</p>
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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Joy Timeline</h1>
              <p className="text-sm text-muted-foreground">Your journey through time</p>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => setViewMode(viewMode === 'calendar' ? 'list' : 'calendar')}
          >
            {viewMode === 'calendar' ? (
              <>
                <List className="w-4 h-4 mr-2" />
                List View
              </>
            ) : (
              <>
                <Calendar className="w-4 h-4 mr-2" />
                Calendar
              </>
            )}
          </Button>
        </div>

        {/* Main Content */}
        {viewMode === 'calendar' ? renderCalendarView() : renderListView()}

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
                  <span className="text-4xl">{getMoodEmoji(selectedEntry.mood_score)}</span>
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

export default Timeline;
