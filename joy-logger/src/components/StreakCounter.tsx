import { Card } from "@/components/ui/card";
import { Sunrise } from "lucide-react";
import { MilestoneBadge } from "./MilestoneBadge";

interface StreakCounterProps {
  streak: number;
}

export const StreakCounter = ({ streak }: StreakCounterProps) => {
  return (
    <Card className="relative overflow-hidden border-0 shadow-warm bg-gradient-card">
      {/* Glow effect background */}
      <div className="absolute inset-0 bg-gradient-glow opacity-60" />
      
      {/* Content */}
      <div className="relative p-10 flex flex-col items-center gap-6">
        {/* Animated sunrise icon */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-sunrise rounded-full blur-2xl opacity-40 animate-glow-pulse" />
          <div className="relative bg-gradient-sunrise rounded-full p-6 shadow-warm animate-gentle-bounce">
            <Sunrise className="w-16 h-16 text-white" strokeWidth={2} />
          </div>
        </div>
        
        {/* Streak display */}
        <div className="text-center space-y-2">
          <div className="flex items-baseline justify-center gap-3">
            <span className="text-6xl font-bold bg-gradient-sunrise bg-clip-text text-transparent">
              {streak}
            </span>
            <span className="text-2xl font-semibold text-foreground/80">
              {streak === 1 ? 'day' : 'days'}
            </span>
          </div>
          <h3 className="text-xl font-semibold text-foreground">
            Your Daily Joy Streak
          </h3>
          <p className="text-base text-muted-foreground max-w-md">
            Each day you show up adds light to your week ✨
          </p>
        </div>
        
        {/* Milestone badges */}
        <MilestoneBadge streak={streak} animate={true} />
      </div>
    </Card>
  );
};