import { useEffect, useState } from "react";

interface SignInCelebrationProps {
  onComplete?: () => void;
}

const SignInCelebration = ({ onComplete }: SignInCelebrationProps) => {
  const [isVisible, setIsVisible] = useState(true);

  const emojis = [
    "😊", "🎉", "✨", "🌟", "💫", "🐶", "🐱", "🦋", 
    "🌸", "🌈", "☀️", "🎈", "💛", "🧡", "🌺", "🦄"
  ];

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      onComplete?.();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {emojis.map((emoji, index) => {
        const startX = Math.random() * 100;
        const endX = startX + (Math.random() - 0.5) * 40;
        const delay = Math.random() * 0.5;
        const duration = 2 + Math.random() * 1;
        
        return (
          <div
            key={index}
            className="absolute text-4xl animate-fade-up"
            style={{
              left: `${startX}%`,
              top: "100%",
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
              animationFillMode: "forwards",
              transform: `translateX(-50%)`,
            }}
          >
            <div
              className="animate-float"
              style={{
                animationDelay: `${delay}s`,
                animationDuration: "1s",
              }}
            >
              {emoji}
            </div>
          </div>
        );
      })}
      
      {/* Center burst effect */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="animate-scale-in">
          <div className="text-8xl animate-float">
            🎊
          </div>
        </div>
      </div>
      
      {/* Sparkle effects */}
      {[...Array(12)].map((_, i) => {
        const angle = (i * 30) * (Math.PI / 180);
        const distance = 100 + Math.random() * 100;
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        
        return (
          <div
            key={`sparkle-${i}`}
            className="absolute top-1/2 left-1/2 text-3xl animate-scale-in"
            style={{
              transform: `translate(${x}px, ${y}px)`,
              animationDelay: `${i * 0.05}s`,
              animationDuration: "0.6s",
            }}
          >
            ✨
          </div>
        );
      })}
    </div>
  );
};

export default SignInCelebration;
