import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { format, parseISO, subYears, subDays, differenceInDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface MemoryEntry {
  id: string;
  entry_date: string;
  entry_text: string;
  mood_score: number | null;
  tags?: string[] | null;
  ai_reflection: string | null;
  resurfaceReason: string;
}

interface MemoryResurfacingProps {
  userId: string;
}

export const MemoryResurfacing = ({ userId }: MemoryResurfacingProps) => {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMemories();
  }, [userId]);

  const loadMemories = async () => {
    try {
      const today = new Date();
      const oneYearAgo = subYears(today, 1);
      const thirtyDaysAgo = subDays(today, 30);

      // Fetch entries for resurfacing
      const { data, error } = await supabase
        .from("journal_entries")
        .select("*")
        .eq("user_id", userId)
        .order("entry_date", { ascending: false });

      if (error) throw error;

      const resurfacedMemories: MemoryEntry[] = [];

      // 1 year ago today
      const oneYearAgoEntry = data?.find(e => {
        const entryDate = parseISO(e.entry_date);
        return Math.abs(differenceInDays(entryDate, oneYearAgo)) <= 3;
      });
      if (oneYearAgoEntry) {
        resurfacedMemories.push({
          ...oneYearAgoEntry,
          resurfaceReason: "One year ago today"
        });
      }

      // 30 days ago
      const thirtyDaysAgoEntry = data?.find(e => {
        const entryDate = parseISO(e.entry_date);
        return Math.abs(differenceInDays(entryDate, thirtyDaysAgo)) <= 2;
      });
      if (thirtyDaysAgoEntry && thirtyDaysAgoEntry.id !== oneYearAgoEntry?.id) {
        resurfacedMemories.push({
          ...thirtyDaysAgoEntry,
          resurfaceReason: "30 days ago"
        });
      }

      // Most positive entry (if not already included)
      const positiveEntry = data
        ?.filter(e => e.mood_score === 5)
        ?.filter(e => !resurfacedMemories.find(m => m.id === e.id))
        ?.sort(() => Math.random() - 0.5)[0];
      
      if (positiveEntry) {
        resurfacedMemories.push({
          ...positiveEntry,
          resurfaceReason: "One of your brightest moments"
        });
      }

      // Random surprise (older than 60 days)
      const olderEntries = data
        ?.filter(e => {
          const entryDate = parseISO(e.entry_date);
          return differenceInDays(today, entryDate) > 60;
        })
        ?.filter(e => !resurfacedMemories.find(m => m.id === e.id));

      if (olderEntries && olderEntries.length > 0) {
        const randomEntry = olderEntries[Math.floor(Math.random() * olderEntries.length)];
        resurfacedMemories.push({
          ...randomEntry,
          resurfaceReason: "A moment worth remembering"
        });
      }

      setMemories(resurfacedMemories);
    } catch (error) {
      console.error("Error loading memories:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || memories.length === 0) {
    return null;
  }

  const currentMemory = memories[currentIndex];

  return (
    <Card className="p-6 bg-gradient-to-br from-accent/20 to-transparent border-accent/30 animate-fade-up">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Remember This?</h3>
          </div>
          {memories.length > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentIndex((prev) => (prev - 1 + memories.length) % memories.length)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {currentIndex + 1}/{memories.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentIndex((prev) => (prev + 1) % memories.length)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span>{format(parseISO(currentMemory.entry_date), "MMMM d, yyyy")}</span>
            <span className="text-xs">•</span>
            <span className="text-primary text-xs font-medium">{currentMemory.resurfaceReason}</span>
          </div>

          <p className="text-base text-foreground leading-relaxed">
            {currentMemory.entry_text}
          </p>

          {currentMemory.tags && currentMemory.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {currentMemory.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {currentMemory.ai_reflection && (
            <div className="pt-3 border-t border-border/50">
              <p className="text-sm text-muted-foreground italic">
                {currentMemory.ai_reflection}
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
