import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Download, Share2, Loader2, Sparkles } from 'lucide-react';
import { toPng } from 'html-to-image';
import { toast } from 'sonner';
import { useGenerateQuoteFromEntry } from '@/hooks/useGenerateQuoteFromEntry';

interface ShareableReflectionCardProps {
  entryText: string;
  date: string;
  mood?: number | null;
  onClose?: () => void;
}

const getMoodEmoji = (score: number | null | undefined): string => {
  if (!score) return '✨';
  if (score === 5) return '😊';
  if (score === 4) return '🙂';
  if (score === 3) return '😐';
  if (score === 2) return '🙁';
  return '😢';
};

export const ShareableReflectionCard = ({ 
  entryText, 
  date, 
  mood,
  onClose 
}: ShareableReflectionCardProps) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const { quote, isLoading, generateQuote } = useGenerateQuoteFromEntry();
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    generateQuote(entryText);
  }, [entryText]);

  const formatDate = (dateString: string) => {
    const [year, month, day] = dateString.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const downloadImage = async () => {
    if (!cardRef.current || !quote) return;
    
    setIsExporting(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#FFFFFF',
        width: 1080,
        height: 1920,
      });

      const link = document.createElement('a');
      link.download = `onegoodthing-${date}.png`;
      link.href = dataUrl;
      link.click();
      
      toast.success('Image downloaded! 🎉');
    } catch (err) {
      console.error('Error generating image:', err);
      toast.error('Failed to generate image. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const shareImage = async () => {
    if (!cardRef.current || !quote) return;

    setIsExporting(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#FFFFFF',
        width: 1080,
        height: 1920,
      });

      // Convert data URL to blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], `onegoodthing-${date}.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'My One Good Thing',
          text: "Here's my One Good Thing today 💛",
        });
        toast.success('Shared successfully! 🎉');
      } else {
        // Fallback to download
        const link = document.createElement('a');
        link.download = `onegoodthing-${date}.png`;
        link.href = dataUrl;
        link.click();
        toast.success('Image downloaded! Share it on your favorite platform 📱');
      }
    } catch (err) {
      console.error('Error sharing image:', err);
      toast.error('Failed to share image. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Preview container with scroll */}
      <div className="max-h-[70vh] overflow-auto rounded-lg border border-border bg-muted/30 p-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Creating your shareable moment...</p>
          </div>
        ) : (
          <div className="flex justify-center">
            {/* The actual card to be exported - fixed dimensions */}
            <div
              ref={cardRef}
              className="relative overflow-hidden rounded-3xl shadow-2xl"
              style={{
                width: '540px',
                height: '960px',
                background: 'linear-gradient(135deg, hsl(var(--primary) / 0.15) 0%, hsl(var(--accent)) 50%, hsl(var(--secondary) / 0.3) 100%)',
              }}
            >
              {/* Content */}
              <div className="relative h-full flex flex-col items-center justify-center p-16 text-center">
                {/* Mood emoji at top */}
                <div className="absolute top-16 text-7xl opacity-40">
                  {getMoodEmoji(mood)}
                </div>

                {/* Main quote */}
                <div className="space-y-12 max-w-md mx-auto">
                  <Sparkles className="w-16 h-16 mx-auto text-primary opacity-60" />
                  
                  <p className="text-4xl leading-tight font-serif text-foreground">
                    "{quote}"
                  </p>
                </div>

                {/* Footer */}
                <div className="absolute bottom-16 left-0 right-0 flex flex-col items-center gap-3 px-16">
                  <div className="h-px w-32 bg-foreground/20" />
                  <div className="space-y-1 text-center">
                    <p className="text-xl font-semibold text-foreground/80">OneGoodThing</p>
                    <p className="text-lg text-foreground/60">{formatDate(date)}</p>
                  </div>
                </div>

                {/* Decorative corner elements */}
                <div className="absolute top-8 left-8 w-20 h-20 rounded-full bg-primary/10" />
                <div className="absolute bottom-8 right-8 w-32 h-32 rounded-full bg-secondary/10" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {quote && !isLoading && (
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={downloadImage}
            disabled={isExporting}
            size="lg"
            className="gap-2"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download PNG
              </>
            )}
          </Button>

          <Button
            onClick={shareImage}
            disabled={isExporting}
            variant="secondary"
            size="lg"
            className="gap-2"
          >
            <Share2 className="w-4 h-4" />
            Share
          </Button>

          {onClose && (
            <Button
              onClick={onClose}
              variant="outline"
              size="lg"
            >
              Close
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
