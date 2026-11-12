import React, { useState, useEffect } from 'react';

const AnimatedMoon = ({ className = '' }) => {
  const [brightness, setBrightness] = useState(0);

  useEffect(() => {
    // Start the brightness animation after a short delay
    const timer = setTimeout(() => {
      setBrightness(1);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`relative ${className}`}>
      {/* Moon Container */}
      <div 
        className="w-32 h-32 relative transition-all duration-[3000ms] ease-out"
        style={{
          opacity: brightness,
          transform: `scale(${0.8 + brightness * 0.2}) translateY(${(1 - brightness) * 20}px)`,
        }}
      >
        {/* Dark Base Moon */}
        <div 
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(circle at 30% 30%, #374151, #1f2937, #111827)',
            boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)',
          }}
        />
        
        {/* Bright Moon Overlay */}
        <div 
          className="absolute inset-0 rounded-full transition-opacity duration-[3000ms] ease-out"
          style={{
            background: 'radial-gradient(circle at 30% 30%, #fbbf24, #f59e0b, #d97706, #92400e)',
            boxShadow: `0 0 ${40 * brightness}px rgba(251, 191, 36, ${0.6 * brightness}), inset 0 0 15px rgba(0,0,0,0.2)`,
            opacity: brightness,
          }}
        />

        {/* Moon Surface Details */}
        <div 
          className="absolute inset-0 rounded-full overflow-hidden transition-opacity duration-[3000ms] ease-out"
          style={{ opacity: brightness }}
        >
          {/* Craters */}
          <div className="absolute top-6 left-6 w-3 h-3 bg-black/30 rounded-full"></div>
          <div className="absolute bottom-8 right-6 w-2 h-2 bg-black/40 rounded-full"></div>
          <div className="absolute top-1/2 left-1/3 w-1.5 h-1.5 bg-black/35 rounded-full"></div>
          
          {/* Subtle texture */}
          <div className="absolute inset-2 rounded-full bg-gradient-to-br from-transparent via-white/5 to-transparent"></div>
        </div>

        {/* Outer Glow */}
        <div 
          className="absolute -inset-4 rounded-full transition-all duration-[3000ms] ease-out"
          style={{
            background: `radial-gradient(circle, rgba(251, 191, 36, ${0.2 * brightness}) 0%, transparent 70%)`,
            transform: `scale(${1 + brightness * 0.3})`,
          }}
        />

        {/* Twinkling Stars Around Moon */}
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-yellow-200 rounded-full transition-all duration-1000 ease-out"
            style={{
              top: `${20 + Math.sin(i * 60 * Math.PI / 180) * 60}%`,
              left: `${20 + Math.cos(i * 60 * Math.PI / 180) * 60}%`,
              opacity: brightness,
              animationDelay: `${i * 0.3}s`,
              animation: brightness > 0 ? 'twinkle 2s ease-in-out infinite' : 'none',
            }}
          />
        ))}
      </div>

      <style jsx>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.5); }
        }
      `}</style>
    </div>
  );
};

export default AnimatedMoon;