import React from 'react';

/**
 * DashboardLayout - Main layout wrapper for dashboard
 * Provides consistent 12-column grid with max-width and padding
 */
const DashboardLayout = ({ children }) => {
  return (
    <div className="w-full min-h-screen bg-cosmic dark:bg-cosmic">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 relative">
        {/* Subtle mesh overlay for depth */}
        <div className="absolute inset-0 bg-mesh opacity-30 pointer-events-none" />
        <div className="relative space-y-[18px]">
          {children}
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;

