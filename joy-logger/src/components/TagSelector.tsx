import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus } from "lucide-react";
import { useState } from "react";

interface TagSelectorProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

const PRESET_TAGS = [
  "Family",
  "Baby",
  "Calm",
  "Nature",
  "Gratitude",
  "Personal Win",
  "Work",
  "Health",
  "Friends",
  "Love"
];

export const TagSelector = ({ selectedTags, onTagsChange }: TagSelectorProps) => {
  const [customTag, setCustomTag] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter(t => t !== tag));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  const addCustomTag = () => {
    const trimmed = customTag.trim();
    if (trimmed && !selectedTags.includes(trimmed)) {
      onTagsChange([...selectedTags, trimmed]);
      setCustomTag("");
      setShowCustomInput(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">
          Add Tags (Optional)
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowCustomInput(!showCustomInput)}
          className="h-7 text-xs"
        >
          <Plus className="w-3 h-3 mr-1" />
          Custom
        </Button>
      </div>

      {showCustomInput && (
        <div className="flex gap-2">
          <Input
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            placeholder="Enter custom tag"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomTag();
              }
            }}
            className="h-8 text-sm"
          />
          <Button
            type="button"
            size="sm"
            onClick={addCustomTag}
            className="h-8"
          >
            Add
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {PRESET_TAGS.map((tag) => (
          <Badge
            key={tag}
            variant={selectedTags.includes(tag) ? "default" : "outline"}
            className="cursor-pointer hover:bg-primary/90 transition-colors"
            onClick={() => toggleTag(tag)}
          >
            {tag}
            {selectedTags.includes(tag) && (
              <X className="w-3 h-3 ml-1" />
            )}
          </Badge>
        ))}
      </div>

      {selectedTags.length > 0 && (
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs text-muted-foreground mb-2">Selected:</p>
          <div className="flex flex-wrap gap-2">
            {selectedTags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => toggleTag(tag)}
              >
                {tag}
                <X className="w-3 h-3 ml-1" />
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
