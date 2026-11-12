import { Badge } from "@/components/ui/badge";
import { Trophy, Flame, Star, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface MilestoneBadgeProps {
  streak: number;
  animate?: boolean;
}

const milestones = [
  { days: 3, icon: Flame, label: "3 Day Streak!", color: "from-orange-400 to-red-500" },
  { days: 7, icon: Star, label: "Week Warrior!", color: "from-yellow-400 to-orange-500" },
  { days: 14, icon: Trophy, label: "Two Weeks!", color: "from-green-400 to-emerald-500" },
  { days: 30, icon: Sparkles, label: "Month Master!", color: "from-purple-400 to-pink-500" },
];

export const MilestoneBadge = ({ streak, animate = false }: MilestoneBadgeProps) => {
  const achievedMilestones = milestones.filter(m => streak >= m.days);
  
  if (achievedMilestones.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 justify-center mt-4">
      {achievedMilestones.map((milestone) => {
        const Icon = milestone.icon;
        const isLatest = milestone.days === Math.max(...achievedMilestones.map(m => m.days));
        
        return (
          <Badge
            key={milestone.days}
            variant="outline"
            className={cn(
              "px-3 py-1.5 text-xs font-semibold bg-gradient-to-r text-white border-0",
              milestone.color,
              animate && isLatest && "animate-scale-in"
            )}
          >
            <Icon className="w-3 h-3 mr-1.5" />
            {milestone.label}
          </Badge>
        );
      })}
    </div>
  );
};
