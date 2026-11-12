import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { BarChart3, Wallet, TrendingUp, Plus, CheckCircle2, ArrowRight, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const OnboardingFlow = ({ onComplete, isNewUser = false }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();

  const steps = [
    {
      title: "Welcome to Moona! 🌙",
      description: "Let's get you started with your investment tracking journey",
      icon: <BarChart3 className="w-12 h-12 text-emerald-400" />,
      content: (
        <div className="space-y-4 text-center">
          <p className="text-lg text-gray-300">
            Track all your investments in one place - stocks, crypto, retirement accounts, and more.
          </p>
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="text-2xl font-bold text-emerald-400">100%</div>
              <div className="text-sm text-gray-400">Free Forever</div>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="text-2xl font-bold text-blue-400">Real-time</div>
              <div className="text-sm text-gray-400">Price Updates</div>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "Add Your First Holding",
      description: "Start by adding your investments",
      icon: <Plus className="w-12 h-12 text-blue-400" />,
      content: (
        <div className="space-y-4">
          <div className="flex items-start space-x-3 p-4 bg-white/5 rounded-lg border border-white/10">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-white">Click "Add Holding"</div>
              <div className="text-sm text-gray-400">In the top right of your dashboard</div>
            </div>
          </div>
          <div className="flex items-start space-x-3 p-4 bg-white/5 rounded-lg border border-white/10">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-white">Enter Your Investment</div>
              <div className="text-sm text-gray-400">Symbol, shares, and cost basis</div>
            </div>
          </div>
          <div className="flex items-start space-x-3 p-4 bg-white/5 rounded-lg border border-white/10">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-white">Or Import from Exchanges</div>
              <div className="text-sm text-gray-400">Connect Robinhood, Coinbase, Binance, and more</div>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "Explore Your Dashboard",
      description: "Discover powerful features",
      icon: <TrendingUp className="w-12 h-12 text-purple-400" />,
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="font-semibold text-white mb-2">📊 Overview Tab</div>
              <div className="text-sm text-gray-400">See your portfolio at a glance</div>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="font-semibold text-white mb-2">📈 Analytics</div>
              <div className="text-sm text-gray-400">Deep dive into performance</div>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="font-semibold text-white mb-2">💼 Holdings</div>
              <div className="text-sm text-gray-400">Manage all your investments</div>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="font-semibold text-white mb-2">📉 vs SPY</div>
              <div className="text-sm text-gray-400">Compare against market</div>
            </div>
          </div>
        </div>
      )
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    localStorage.setItem('moona_onboarding_completed', 'true');
    if (onComplete) {
      onComplete();
    }
  };

  if (localStorage.getItem('moona_onboarding_completed') === 'true' && !isNewUser) {
    return null;
  }

  const step = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl bg-gradient-to-br from-slate-900 to-slate-800 border-white/20 shadow-2xl">
        <CardContent className="p-8">
          <div className="flex justify-between items-start mb-6">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-2">
                {step.icon}
                <h2 className="text-2xl font-bold text-white">{step.title}</h2>
              </div>
              <p className="text-gray-400">{step.description}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              <span>Step {currentStep + 1} of {steps.length}</span>
              <span>{Math.round(progress)}%</span>
            </div>
          </div>

          {/* Step Content */}
          <div className="mb-8 min-h-[200px]">
            {step.content}
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center">
            <Button
              variant="ghost"
              onClick={handleSkip}
              className="text-gray-400 hover:text-white"
            >
              Skip Tour
            </Button>
            <Button
              onClick={handleNext}
              className="bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600"
            >
              {currentStep < steps.length - 1 ? (
                <>
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              ) : (
                <>
                  Get Started
                  <CheckCircle2 className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OnboardingFlow;

