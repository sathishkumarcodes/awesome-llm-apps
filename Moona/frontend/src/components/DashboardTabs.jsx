import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { LayoutGrid, BarChart3, List, TrendingUp, Clock } from 'lucide-react';

const DashboardTabs = ({ 
  selectedTab, 
  onTabChange, 
  overviewContent,
  analyticsContent,
  holdingsContent,
  spyComparisonContent,
  futureContent
}) => {
  return (
    <Tabs value={selectedTab} onValueChange={onTabChange} className="w-full">
      <TabsList className="grid w-full grid-cols-5 mb-6 bg-white/70 dark:bg-[#112334] backdrop-blur-sm border-0 dark:border-[rgba(255,255,255,0.05)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] shadow-sm rounded-full p-1 h-12">
        <TabsTrigger 
          value="overview" 
          className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-sm rounded-full font-medium transition-all duration-200 text-sm flex items-center justify-center gap-2"
        >
          <LayoutGrid className="w-4 h-4" />
          <span className="hidden sm:inline">Overview</span>
        </TabsTrigger>
        <TabsTrigger 
          value="analytics" 
          className="data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=active]:shadow-sm rounded-full font-medium transition-all duration-200 text-sm flex items-center justify-center gap-2"
        >
          <BarChart3 className="w-4 h-4" />
          <span className="hidden sm:inline">Analytics</span>
        </TabsTrigger>
        <TabsTrigger 
          value="investments" 
          className="data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-sm rounded-full font-medium transition-all duration-200 text-sm flex items-center justify-center gap-2"
        >
          <List className="w-4 h-4" />
          <span className="hidden sm:inline">Holdings</span>
        </TabsTrigger>
        <TabsTrigger 
          value="spy-comparison" 
          className="data-[state=active]:bg-red-500 data-[state=active]:text-white data-[state=active]:shadow-sm rounded-full font-medium transition-all duration-200 text-sm flex items-center justify-center gap-2"
        >
          <TrendingUp className="w-4 h-4" />
          <span className="hidden sm:inline">vs SPY</span>
        </TabsTrigger>
        <TabsTrigger 
          value="future" 
          className="data-[state=active]:bg-purple-500 data-[state=active]:text-white data-[state=active]:shadow-sm rounded-full font-medium transition-all duration-200 text-sm flex items-center justify-center gap-2"
        >
          <Clock className="w-4 h-4" />
          <span className="hidden sm:inline">Future</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-6">
        {overviewContent}
      </TabsContent>

      <TabsContent value="analytics" className="space-y-6">
        {analyticsContent}
      </TabsContent>

      <TabsContent value="investments" className="space-y-6">
        {holdingsContent}
      </TabsContent>

      <TabsContent value="spy-comparison" className="space-y-6">
        {spyComparisonContent}
      </TabsContent>

      <TabsContent value="future" className="space-y-6">
        {futureContent}
      </TabsContent>
    </Tabs>
  );
};

export default DashboardTabs;

