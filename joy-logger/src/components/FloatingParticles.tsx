import { Sparkles } from "lucide-react";

const FloatingParticles = () => {
  const particles = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    delay: i * 0.7,
    duration: 15 + (i % 3) * 5,
    left: 10 + (i * 12) % 90,
    size: 16 + (i % 3) * 8,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute animate-float opacity-20"
          style={{
            left: `${particle.left}%`,
            top: `${(particle.id * 17) % 80}%`,
            animationDelay: `${particle.delay}s`,
            animationDuration: `${particle.duration}s`,
          }}
        >
          {particle.id % 3 === 0 ? (
            <Sparkles 
              className="text-primary-glow" 
              size={particle.size} 
            />
          ) : (
            <div
              className={`rounded-full ${
                particle.id % 2 === 0 
                  ? "bg-primary/30" 
                  : "bg-accent/40"
              }`}
              style={{
                width: `${particle.size}px`,
                height: `${particle.size}px`,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default FloatingParticles;
