import React from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { TrendingUp, Shield, BarChart3, Wallet, Star, ArrowRight, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MoonaLogo from './MoonaLogo';
import AnimatedMoon from './AnimatedMoon';
import ThemeToggle from './ThemeToggle';

const LandingPage = () => {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-cosmic relative overflow-hidden">
      {/* Enhanced Cosmic Background with Mesh */}
      <div className="absolute inset-0 bg-mesh opacity-40" />
      
      {/* Animated Moon Background */}
      <AnimatedMoon className="fixed top-32 right-32 pointer-events-none opacity-30 animate-float" />
      
      {/* Enhanced Background Stars with Glow */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(30)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full animate-pulse"
            style={{
              width: `${Math.random() * 3 + 1}px`,
              height: `${Math.random() * 3 + 1}px`,
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${Math.random() * 2 + 2}s`,
              background: `radial-gradient(circle, rgba(180, 255, 255, 0.8) 0%, transparent 70%)`,
              boxShadow: `0 0 ${Math.random() * 4 + 2}px rgba(180, 255, 255, 0.6)`
            }}
          />
        ))}
      </div>

      {/* Header */}
      <div className="relative z-20 bg-white/10 backdrop-blur-md border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <MoonaLogo size="md" showTagline={false} className="text-white" />
            <div className="flex items-center space-x-4">
              <ThemeToggle className="text-white hover:bg-white/10" />
              <Button
                onClick={handleGetStarted}
                variant="outline"
                className="bg-white/10 border-white/30 text-white hover:bg-white/20"
              >
                Sign In
              </Button>
              <Button
                onClick={handleGetStarted}
                className="bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600"
              >
                Get Started
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Hero Section */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center space-y-8">
          <div className="space-y-6">
            <div className="inline-flex items-center px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 rounded-full text-emerald-300 text-sm font-medium">
              <Star className="w-4 h-4 mr-2" />
              Trusted by thousands of investors
            </div>
            
            <h1 className="text-5xl lg:text-7xl font-display font-black bg-gradient-to-r from-white via-slate-100 to-emerald-200 bg-clip-text text-transparent animate-fade-in-up">
              Where your portfolio 
              <br />
              <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
                shines brighter
              </span>
            </h1>
            
            <p className="text-xl lg:text-2xl text-slate-300 max-w-3xl mx-auto font-sans animate-fade-in-up stagger-1">
              Track your stocks, crypto, and retirement investments with precision. 
              Get real-time insights and watch your wealth grow among the stars.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              onClick={handleGetStarted}
              size="lg"
              className="bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500 hover:from-emerald-600 hover:via-cyan-600 hover:to-blue-600 text-lg px-8 py-4 h-auto font-display font-semibold glow-primary animate-fade-in-up stagger-2 transition-all duration-300"
            >
              Start Tracking Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            
            <Button
              variant="outline"
              size="lg"
              className="bg-white/10 border-white/30 text-white hover:bg-white/20 text-lg px-8 py-4 h-auto font-display font-semibold animate-fade-in-up stagger-3 transition-all duration-300"
            >
              <Play className="w-5 h-5 mr-2" />
              Watch Demo
            </Button>
          </div>
        </div>

        {/* Features Section */}
        <div className="mt-32">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">
              Investment tracking that's out of this world
            </h2>
            <p className="text-xl text-slate-300 max-w-2xl mx-auto">
              Everything you need to manage your portfolio with celestial precision
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <Card className="bg-white/10 dark:bg-[#112334] border-white/20 dark:border-[rgba(255,255,255,0.05)] backdrop-blur-md dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] rounded-2xl hover:bg-opacity-80 dark:hover:-translate-y-0.5 transition-all duration-200">
              <CardContent className="p-8 text-center">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Stellar Analytics</h3>
                <p className="text-slate-300 text-sm">Real-time portfolio insights and performance tracking</p>
              </CardContent>
            </Card>

            <Card className="bg-white/10 dark:bg-[#112334] border-white/20 dark:border-[rgba(255,255,255,0.05)] backdrop-blur-md dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] rounded-2xl hover:bg-opacity-80 dark:hover:-translate-y-0.5 transition-all duration-200">
              <CardContent className="p-8 text-center">
                <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Cosmic Security</h3>
                <p className="text-slate-300 text-sm">Bank-level security to protect your investment data</p>
              </CardContent>
            </Card>

            <Card className="bg-white/10 dark:bg-[#112334] border-white/20 dark:border-[rgba(255,255,255,0.05)] backdrop-blur-md dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] rounded-2xl hover:bg-opacity-80 dark:hover:-translate-y-0.5 transition-all duration-200">
              <CardContent className="p-8 text-center">
                <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Wallet className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Multi-Asset Galaxy</h3>
                <p className="text-slate-300 text-sm">Stocks, crypto, and retirement accounts in one place</p>
              </CardContent>
            </Card>

            <Card className="bg-white/10 dark:bg-[#112334] border-white/20 dark:border-[rgba(255,255,255,0.05)] backdrop-blur-md dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] rounded-2xl hover:bg-opacity-80 dark:hover:-translate-y-0.5 transition-all duration-200">
              <CardContent className="p-8 text-center">
                <div className="w-12 h-12 bg-orange-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="w-6 h-6 text-orange-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Market Constellation</h3>
                <p className="text-slate-300 text-sm">Compare performance against SPY and market benchmarks</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-32 text-center">
          <div className="bg-gradient-to-r from-emerald-500/20 to-blue-500/20 border border-emerald-500/30 rounded-2xl p-8 lg:p-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
              Ready to launch your portfolio into orbit?
            </h2>
            <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
              Join thousands of investors who trust Moona to track and grow their wealth.
            </p>
            <Button
              onClick={handleGetStarted}
              size="lg"
              className="bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 text-lg px-12 py-4 h-auto"
            >
              Get Started for Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 border-t border-white/20 bg-white/5 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <MoonaLogo size="sm" className="text-white mb-4 md:mb-0" />
            <div className="flex items-center space-x-6 text-sm text-slate-400">
              <span>© 2024 Moona. All rights reserved.</span>
              <span>Privacy Policy</span>
              <span>Terms of Service</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;