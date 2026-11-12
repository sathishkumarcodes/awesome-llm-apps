import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Settings from "./pages/Settings";
import Stats from "./pages/Stats";
import Timeline from "./pages/Timeline";
import Insights from "./pages/Insights";
import MonthlyReflection from "./pages/MonthlyReflection";
import NotFound from "./pages/NotFound";

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/reflection" element={<MonthlyReflection />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
