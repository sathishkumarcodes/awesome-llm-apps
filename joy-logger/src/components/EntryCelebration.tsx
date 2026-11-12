import { useEffect, useState } from "react";

interface EntryCelebrationProps {
  onComplete?: () => void;
}

const EntryCelebration = ({ onComplete }: EntryCelebrationProps) => {
  const [isVisible, setIsVisible] = useState(true);
  const [messageIndex, setMessageIndex] = useState(0);

  const celebrationMessages = [
    "✨ Captured!",
    "🌟 This moment matters",
    "💛 You're building something beautiful"
  ];

  const floatingEmojis = [
    "✨", "🌟", "💫", "⭐", "🌈", "🦋", 
    "🌸", "💛", "🌺", "🎨", "🎭", "🎪"
  ];

  useEffect(() => {
    // Cycle through messages
    const messageTimer = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % celebrationMessages.length);
    }, 1000);

    // Hide after 3 seconds
    const hideTimer = setTimeout(() => {
      setIsVisible(false);
      onComplete?.();
    }, 3500);

    return () => {
      clearInterval(messageTimer);
      clearTimeout(hideTimer);
    };
  }, [onComplete]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {/* Floating emojis from bottom */}
      {floatingEmojis.map((emoji, index) => {
        const startX = Math.random() * 100;
        const delay = Math.random() * 0.5;
        const duration = 2 + Math.random() * 1;
        const rotate = Math.random() * 360;
        
        return (
          <div
            key={index}
            className="absolute text-4xl animate-fade-up opacity-0"
            style={{
              left: `${startX}%`,
              top: "100%",
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
              animationFillMode: "forwards",
              transform: `translateX(-50%) rotate(${rotate}deg)`,
            }}
          >
            <div
              className="animate-float"
              style={{
                animationDelay: `${delay}s`,
                animationDuration: "1.5s",
              }}
            >
              {emoji}
            </div>
          </div>
        );
      })}
      
      {/* Center message with scale animation */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="animate-scale-in">
          <div className="bg-background/95 backdrop-blur-lg rounded-3xl px-12 py-8 shadow-glow border-2 border-primary/30">
            <div 
              key={messageIndex}
              className="text-4xl font-bold text-center animate-fade-in bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent"
            >
              {celebrationMessages[messageIndex]}
            </div>
          </div>
        </div>
      </div>
      
      {/* Sparkle burst effect */}
      {[...Array(16)].map((_, i) => {
        const angle = (i * 22.5) * (Math.PI / 180);
        const distance = 120 + Math.random() * 80;
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        
        return (
          <div
            key={`sparkle-${i}`}
            className="absolute top-1/2 left-1/2 text-3xl animate-scale-in opacity-0"
            style={{
              transform: `translate(${x}px, ${y}px)`,
              animationDelay: `${i * 0.04}s`,
              animationDuration: "0.8s",
              animationFillMode: "forwards",
            }}
          >
            ✨
          </div>
        );
      })}

      {/* Glow pulse effect */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div 
          className="w-64 h-64 rounded-full bg-primary/20 animate-glow-pulse"
          style={{
            filter: "blur(60px)",
          }}
        />
      </div>
    </div>
  );
};

export default EntryCelebration;
