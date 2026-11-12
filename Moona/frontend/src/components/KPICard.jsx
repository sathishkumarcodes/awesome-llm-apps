import React from 'react';
import { Card, CardContent } from './ui/card';

const KPICard = ({ icon: Icon, title, value, subtitle, emptyState, valueColor = "text-gray-900" }) => {
  const isEmpty = value === null || value === undefined || (typeof value === 'string' && value === '');
  
  return (
    <Card className="bg-white border border-gray-200 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {Icon && (
              <div className="mb-3">
                <Icon className="h-5 w-5 text-gray-400" />
              </div>
            )}
            <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
            {isEmpty && emptyState ? (
              <div className="text-sm text-gray-500 mt-2">{emptyState}</div>
            ) : (
              <>
                <p className={`text-2xl font-bold ${valueColor} mt-1`}>
                  {value}
                </p>
                {subtitle && (
                  <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default KPICard;

