import { cn } from "@/lib/utils";

interface MoodSelectorProps {
  value: number | null;
  onChange: (mood: number) => void;
  disabled?: boolean;
}

const moods = [
  { value: 1, emoji: "😢", label: "Rough" },
  { value: 2, emoji: "😕", label: "Meh" },
  { value: 3, emoji: "🙂", label: "Okay" },
  { value: 4, emoji: "😌", label: "Good" },
  { value: 5, emoji: "😄", label: "Great" },
];

export const MoodSelector = ({ value, onChange, disabled }: MoodSelectorProps) => {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">
        How are you feeling? <span className="text-muted-foreground">(optional)</span>
      </label>
      <div className="flex gap-2 justify-center">
        {moods.map((mood) => (
          <button
            key={mood.value}
            type="button"
            onClick={() => onChange(mood.value)}
            disabled={disabled}
            className={cn(
              "flex flex-col items-center gap-1 p-3 rounded-lg transition-all hover:scale-110 hover:shadow-soft",
              value === mood.value
                ? "bg-primary/20 border-2 border-primary shadow-glow scale-110"
                : "bg-background/50 border-2 border-border hover:border-primary/50",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <span className="text-3xl">{mood.emoji}</span>
            <span className="text-xs text-muted-foreground">{mood.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
