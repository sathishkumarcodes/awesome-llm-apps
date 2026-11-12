import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Loader2, Sparkles, Mic, MicOff, Image, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { MoodSelector } from "./MoodSelector";
import { TagSelector } from "./TagSelector";
import { useVoiceInput } from "@/hooks/useVoiceInput";

interface JournalPromptProps {
  onEntrySubmitted: () => void;
  hasEntryToday: boolean;
  userId: string;
}

export const JournalPrompt = ({ onEntrySubmitted, hasEntryToday, userId }: JournalPromptProps) => {
  const [entry, setEntry] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  
  const {
    isListening,
    isProcessing,
    transcript,
    isSupported: isVoiceSupported,
    permissionDenied,
    error: voiceError,
    startListening,
    stopListening,
    resetTranscript,
  } = useVoiceInput();

  // Update entry when transcript changes
  useEffect(() => {
    if (transcript) {
      setEntry(prev => {
        const newText = prev ? `${prev} ${transcript}` : transcript;
        return newText;
      });
      resetTranscript();
    }
  }, [transcript, resetTranscript]);

  const MAX_CHARS = 240;

  const toggleVoiceInput = () => {
    if (isListening) {
      stopListening();
      if (transcript) {
        toast.success("Added from voice ✨");
      }
    } else {
      startListening();
    }
  };

  useEffect(() => {
    if (voiceError) {
      toast.error(voiceError);
    }
  }, [voiceError]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setSelectedPhoto(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    setSelectedPhoto(null);
    setPhotoPreview(null);
  };

  const fireConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  const handleSubmit = async () => {
    if (!entry.trim()) {
      toast.error("Please write something first!");
      return;
    }

    if (entry.length > MAX_CHARS) {
      toast.error(`Please keep it under ${MAX_CHARS} characters`);
      return;
    }

    setIsSubmitting(true);

    try {
      let photoUrl = null;

      // Upload photo if selected
      if (selectedPhoto) {
        const fileExt = selectedPhoto.name.split('.').pop();
        const fileName = `${userId}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError, data } = await supabase.storage
          .from('journal-photos')
          .upload(fileName, selectedPhoto, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) throw uploadError;

        // Get signed URL for private bucket (1 year expiry)
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from('journal-photos')
          .createSignedUrl(fileName, 31536000); // 1 year in seconds

        if (signedUrlError) throw signedUrlError;
        
        photoUrl = signedUrlData.signedUrl;
      }

      // Generate AI reflection (and mood if not provided)
      const { data: reflectionData, error: reflectionError } = await supabase.functions.invoke(
        "generate-reflection",
        { body: { entryText: entry, moodScore: mood } }
      );

      if (reflectionError) throw reflectionError;

      // Save to database with local date (not UTC)
      const now = new Date();
      const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      
      const { error: insertError } = await supabase
        .from("journal_entries")
        .insert({
          user_id: userId,
          entry_text: entry,
          ai_reflection: reflectionData.reflection,
          mood_score: reflectionData.moodScore || mood,
          entry_date: localDate,
          tags: tags.length > 0 ? tags : null,
          photo_url: photoUrl
        });

      if (insertError) throw insertError;

      // Trigger confetti
      fireConfetti();
      toast.success("Entry saved! ✨");
      
      // Delayed form reset and callback
      setTimeout(() => {
        setEntry("");
        setMood(null);
        setTags([]);
        setSelectedPhoto(null);
        setPhotoPreview(null);
        onEntrySubmitted();
      }, 1000);
    } catch (error: any) {
      console.error("Error submitting entry:", error);
      toast.error(error.message || "Failed to save entry");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (hasEntryToday) {
    return (
      <Card className="p-8 text-center bg-card border-0 shadow-soft animate-scale-in">
        <Sparkles className="w-16 h-16 mx-auto mb-4 text-primary animate-float" strokeWidth={2} />
        <p className="text-muted-foreground text-lg leading-relaxed">
          You've captured today's good thing — a single moment a day makes a real difference. Come back tomorrow for the next one ✨
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-8 bg-gradient-to-br from-background to-accent/30 shadow-soft">
        <div className="space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">
            Add Today's Good Thing
          </h1>
          <p className="text-muted-foreground">
            One small moment can shift your whole day.
          </p>
        </div>

        <MoodSelector 
          value={mood} 
          onChange={setMood} 
          disabled={isSubmitting}
        />

        <TagSelector selectedTags={tags} onTagsChange={setTags} />

        <div className="space-y-2">
          <div className="relative">
            <Textarea
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              placeholder="What brought you joy today? A perfect cup of coffee, a kind word, a moment of peace..."
              className="min-h-[120px] resize-none pr-12"
              disabled={isSubmitting || isListening}
              maxLength={MAX_CHARS}
            />
            
            {/* Voice Input Button */}
            {isVoiceSupported && !permissionDenied && (
              <button
                type="button"
                onClick={toggleVoiceInput}
                disabled={isSubmitting || isProcessing}
                className={`absolute right-3 bottom-3 p-2.5 rounded-full transition-all ${
                  isListening
                    ? 'bg-primary text-primary-foreground animate-glow-pulse'
                    : 'bg-muted hover:bg-muted-foreground/20 text-muted-foreground'
                } ${isProcessing ? 'opacity-50' : ''}`}
                aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
              >
                {isProcessing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isListening ? (
                  <Mic className="w-5 h-5" />
                ) : (
                  <MicOff className="w-5 h-5" />
                )}
              </button>
            )}
          </div>
          
          <div className="flex justify-between items-center text-sm">
            <div>
              {isListening && (
                <span className="text-primary font-medium animate-pulse">
                  🎤 Listening...
                </span>
              )}
              {isProcessing && (
                <span className="text-primary font-medium">
                  ✨ Processing...
                </span>
              )}
            </div>
            <span className={entry.length > MAX_CHARS - 20 ? "text-destructive" : "text-muted-foreground"}>
              {entry.length}/{MAX_CHARS}
            </span>
          </div>
        </div>

        {/* Photo Upload Section */}
        <div className="space-y-3">
          {photoPreview ? (
            <div className="relative rounded-lg overflow-hidden">
              <img 
                src={photoPreview} 
                alt="Journal photo preview" 
                className="w-full h-48 object-cover rounded-lg"
              />
              <button
                type="button"
                onClick={removePhoto}
                disabled={isSubmitting}
                className="absolute top-2 right-2 p-2 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90 transition-colors"
                aria-label="Remove photo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary hover:bg-accent/50 transition-colors">
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoSelect}
                disabled={isSubmitting}
                className="hidden"
              />
              <Image className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Add a photo (optional)
              </span>
            </label>
          )}
        </div>

        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || !entry.trim()}
          className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-primary to-primary-glow hover:shadow-glow transition-all"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Reflecting...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-5 w-5" />
              Save & Reflect
            </>
          )}
        </Button>
      </div>
    </Card>
  );
};