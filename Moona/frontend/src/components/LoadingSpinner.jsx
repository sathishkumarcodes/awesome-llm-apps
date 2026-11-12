import React from 'react';
import { TrendingUp } from 'lucide-react';

const LoadingSpinner = ({ message = "Loading your portfolio..." }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
      <div className="text-center space-y-6">
        <div className="relative">
          <div className="w-20 h-20 bg-gradient-to-r from-emerald-400 to-blue-500 rounded-2xl flex items-center justify-center mx-auto animate-pulse">
            <TrendingUp className="w-10 h-10 text-white" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-blue-500 rounded-2xl animate-ping opacity-75"></div>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-white">
            {message}
          </h2>
          <div className="flex items-center justify-center space-x-1">
            <div className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingSpinner;