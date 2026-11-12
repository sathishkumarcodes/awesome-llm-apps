import React from 'react';

const MoonaLogo = ({ size = 'md', className = '', showTagline = false }) => {
  const sizeClasses = {
    sm: {
      moonSize: 'w-6 h-6 text-lg',
      title: 'text-lg',
      tagline: 'text-xs'
    },
    md: {
      moonSize: 'w-8 h-8 text-xl',
      title: 'text-xl',
      tagline: 'text-sm'
    },
    lg: {
      moonSize: 'w-10 h-10 text-2xl',
      title: 'text-2xl',
      tagline: 'text-base'
    },
    xl: {
      moonSize: 'w-12 h-12 text-3xl',
      title: 'text-3xl',
      tagline: 'text-lg'
    }
  };

  const currentSize = sizeClasses[size];
  const isWhiteTheme = className.includes('text-white');

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      {/* Static Moon */}
      <div 
        className={`${currentSize.moonSize} flex items-center justify-center rounded-full`}
        style={{
          background: isWhiteTheme 
            ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)'
            : 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)',
          boxShadow: isWhiteTheme 
            ? '0 4px 6px -1px rgba(251, 191, 36, 0.3)'
            : '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        }}
      >
        <span>🌙</span>
      </div>

      {/* Brand Text */}
      <div className="flex flex-col">
        <h1 
          className={`${currentSize.title} font-bold tracking-tight ${
            isWhiteTheme ? 'text-white' : 'text-slate-800'
          }`}
        >
          Moona
        </h1>

        {showTagline && (
          <p 
            className={`${currentSize.tagline} font-medium ${
              isWhiteTheme ? 'text-white/70' : 'text-slate-600'
            }`}
          >
            where your portfolio shines brighter ✨
          </p>
        )}
      </div>
    </div>
  );
};

export default MoonaLogo;