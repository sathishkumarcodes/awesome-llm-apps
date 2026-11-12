import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface LifeInsightProps {
  userId: string;
  entriesCount: number;
}

export const LifeInsight = ({ userId, entriesCount }: LifeInsightProps) => {
  const [insight, setInsight] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const generateInsight = async () => {
    if (entriesCount < 1) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-life-insight', {
        body: {}
      });

      if (error) throw error;

      if (data?.insight) {
        setInsight(data.insight);
      }
    } catch (error: any) {
      console.error('Error generating insight:', error);
      if (error.message?.includes('429')) {
        toast({
          title: "Rate limit reached",
          description: "Please try again in a moment.",
          variant: "destructive",
        });
      } else if (error.message?.includes('402')) {
        toast({
          title: "AI service unavailable",
          description: "Please try again later.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Couldn't generate insight",
          description: "Please try again later.",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    generateInsight();
  }, [entriesCount]); // Regenerate when entries count changes

  if (entriesCount < 1) return null; // Don't show until user has at least 1 entry

  return (
    <Card className="p-6 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20 animate-fade-up">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary flex-shrink-0" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">Your Journey</h3>
            <p className="text-xs text-muted-foreground">Based on your last 7 days</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={generateInsight}
          disabled={isLoading}
          className="flex-shrink-0 h-8 w-8"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </Button>
      </div>
      
      {isLoading && !insight ? (
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <p className="text-sm">Reflecting on your entries...</p>
        </div>
      ) : insight ? (
        <p className="text-base text-foreground/90 leading-relaxed italic">
          {insight}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          Keep journaling to see your personalized insight
        </p>
      )}
    </Card>
  );
};
