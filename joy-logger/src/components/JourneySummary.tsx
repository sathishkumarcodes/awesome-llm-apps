import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp } from "lucide-react";

interface JourneySummaryProps {
  totalEntries: number;
  onViewStats: () => void;
}

export const JourneySummary = ({ totalEntries, onViewStats }: JourneySummaryProps) => {
  return (
    <Card className="p-6 bg-card/50 border-border/50">
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-primary/10">
            <TrendingUp className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Your Journey</h3>
            <p className="text-sm text-muted-foreground">
              You've captured {totalEntries} moments of joy. Each entry helps you discover patterns in what brings you happiness.
            </p>
            <Button
              variant="link"
              onClick={onViewStats}
              className="p-0 h-auto text-primary hover:text-primary/80"
            >
              See week insights →
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
};
