import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Facebook, Twitter } from "lucide-react";

interface SocialShareProps {
  streak: number;
  todayEntry: string;
  todayMood: number;
}

const getMoodEmoji = (score: number) => {
  if (score >= 5) return "😊";
  if (score >= 4) return "🙂";
  if (score >= 3) return "😐";
  if (score >= 2) return "😕";
  return "😔";
};

export const SocialShare = ({ streak, todayEntry, todayMood }: SocialShareProps) => {
  const moodEmoji = getMoodEmoji(todayMood);
  const appUrl = window.location.origin;
  const shareMessage = `Today's OneGoodThing ${moodEmoji}\n\n"${todayEntry}"\n\n🔥 ${streak}-day streak!\n\nStart capturing the one thing that brought you joy today. Join me ✨`;

  const handleFacebookShare = () => {
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(appUrl)}&quote=${encodeURIComponent(shareMessage)}`;
    window.open(facebookUrl, "_blank", "width=600,height=400");
  };

  const handleTwitterShare = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareMessage)}&url=${encodeURIComponent(appUrl)}`;
    window.open(twitterUrl, "_blank", "width=600,height=400");
  };


  return (
    <Card className="p-4 bg-muted/30 border-muted">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Share your journey
        </p>
        <div className="flex gap-2">
          <Button
            onClick={handleFacebookShare}
            variant="ghost"
            size="sm"
            className="hover:bg-[#1877F2] hover:text-white transition-all"
          >
            <Facebook className="w-4 h-4" />
          </Button>
          <Button
            onClick={handleTwitterShare}
            variant="ghost"
            size="sm"
            className="hover:bg-black hover:text-white transition-all"
          >
            <Twitter className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
};
