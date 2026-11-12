import React from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { TrendingUp, Shield, BarChart3, Wallet, Mail } from 'lucide-react';
import MoonaLogo from './MoonaLogo';
import AnimatedMoon from './AnimatedMoon';
import ThemeToggle from './ThemeToggle';

const LoginPage = ({ onLogin }) => {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [name, setName] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [isRegistering, setIsRegistering] = React.useState(false);
  const [error, setError] = React.useState('');
  const [passwordStrength, setPasswordStrength] = React.useState(0);
  const [emailValid, setEmailValid] = React.useState(true);
  const [showSuccess, setShowSuccess] = React.useState(false);
  
  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

  // Auto-focus email input on mount
  React.useEffect(() => {
    const emailInput = document.getElementById('login-email') || document.getElementById('register-email');
    if (emailInput) {
      setTimeout(() => emailInput.focus(), 100);
    }
  }, []);

  // Email validation
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Password strength calculation
  React.useEffect(() => {
    if (!password) {
      setPasswordStrength(0);
      return;
    }
    
    let strength = 0;
    if (password.length >= 6) strength += 1;
    if (password.length >= 8) strength += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength += 1;
    if (/\d/.test(password)) strength += 1;
    if (/[^a-zA-Z\d]/.test(password)) strength += 1;
    
    setPasswordStrength(strength);
  }, [password]);

  const getPasswordStrengthColor = () => {
    if (passwordStrength <= 1) return 'bg-red-500';
    if (passwordStrength <= 2) return 'bg-orange-500';
    if (passwordStrength <= 3) return 'bg-yellow-500';
    return 'bg-emerald-500';
  };

  const getPasswordStrengthText = () => {
    if (passwordStrength <= 1) return 'Weak';
    if (passwordStrength <= 2) return 'Fair';
    if (passwordStrength <= 3) return 'Good';
    return 'Strong';
  };
  
  const handleMoonaLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    if (!validateEmail(email)) {
      setEmailValid(false);
      setError('Please enter a valid email address');
      return;
    }
    setEmailValid(true);
    
    setIsLoading(true);
    setError('');
    try {
      // Add timeout for faster failure
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const userData = await response.json();
        setShowSuccess(true);
        // Smooth transition with success animation
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 500);
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Login failed' }));
        const errorMsg = errorData.detail || 'Login failed. Please try again.';
        
        // Check if it's a database connection error
        if (errorMsg.includes('Database connection') || errorMsg.includes('MongoDB')) {
          setError('Database not connected. Please set up Supabase. See QUICK_SUPABASE_FIX.md for instructions.');
        } else {
          setError(errorMsg);
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        setError('Request timed out. Please check your connection and try again.');
      } else {
        console.error('Login error:', error);
        setError('Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleMoonaRegister = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }

    if (!validateEmail(email)) {
      setEmailValid(false);
      setError('Please enter a valid email address');
      return;
    }
    setEmailValid(true);

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    
    setIsLoading(true);
    setError('');
    try {
      // Add timeout for faster failure
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          email, 
          password,
          name: name || undefined
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const userData = await response.json();
        setShowSuccess(true);
        // Mark as new user for onboarding
        localStorage.setItem('moona_is_new_user', 'true');
        // Smooth transition with success animation
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 500);
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Registration failed' }));
        const errorMsg = errorData.detail || 'Registration failed. Please try again.';
        
        // Check if it's a database connection error
        if (errorMsg.includes('Database connection') || errorMsg.includes('MongoDB')) {
          setError('Database not connected. Please set up Supabase. See QUICK_SUPABASE_FIX.md for instructions.');
        } else {
          setError(errorMsg);
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        setError('Request timed out. Please check your connection and try again.');
      } else {
        console.error('Registration error:', error);
        setError('Registration failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    // Use configured Client ID or fallback to your Client ID
    const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID || '687644263156-ogrv9joos1118leid0asb2clkedmiuja.apps.googleusercontent.com';
    
    console.log('🔵 Starting Google OAuth login with Client ID:', googleClientId.substring(0, 20) + '...');

    // Redirect to Google OAuth
    const redirectUri = encodeURIComponent(window.location.origin + '/login');
    const state = Math.random().toString(36).substring(7);
    localStorage.setItem('oauth_state', state);
    
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${googleClientId}&` +
      `redirect_uri=${redirectUri}&` +
      `response_type=code&` +
      `scope=openid email profile&` +
      `state=${state}&` +
      `access_type=offline&` +
      `prompt=consent`;
    
    console.log('🔵 Redirecting to Google OAuth...');
    window.location.href = googleAuthUrl;
  };

  // Check if Google OAuth is configured - FORCE ENABLED
  const isGoogleOAuthEnabled = () => {
    // Always return true - Gmail login is enabled
    const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID || '687644263156-ogrv9joos1118leid0asb2clkedmiuja.apps.googleusercontent.com';
    console.log('✅ Google OAuth ENABLED - Gmail login available');
    return true; // Force enable Gmail login
  };

  // Handle Google OAuth callback
  React.useEffect(() => {
    // Prevent duplicate processing
    let isProcessing = false;
    
    const handleGoogleCallback = async () => {
      // Prevent multiple simultaneous calls
      if (isProcessing) {
        console.log('⏸️ Callback already processing, skipping...');
        return;
      }
      
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const error = urlParams.get('error');
      const storedState = localStorage.getItem('oauth_state');
      
      // Only process if we have a code or error
      if (!code && !error) {
        return; // No OAuth callback, exit early
      }
      
      isProcessing = true;
      console.log('🔵 Google OAuth Callback:', { code: code ? 'present' : 'missing', state, storedState, error });
      
      // Check for OAuth error from Google
      if (error) {
        console.error('❌ Google OAuth Error:', error);
        setError(`Google authentication error: ${error}. Please try again.`);
        window.history.replaceState({}, document.title, '/login');
        isProcessing = false;
        return;
      }
      
      // If we have a code, proceed with authentication
      // State check is important but we'll be more lenient for better UX
      if (code) {
        // Check if we've already processed this code (prevent duplicate processing)
        const processedCodeKey = `oauth_code_${code.substring(0, 20)}`;
        if (sessionStorage.getItem(processedCodeKey)) {
          console.log('⏸️ Code already processed, skipping...');
          isProcessing = false;
          // Clean URL and redirect
          window.history.replaceState({}, document.title, '/login');
          return;
        }
        
        // Mark code as being processed
        sessionStorage.setItem(processedCodeKey, 'true');
        
        // Warn if state doesn't match but still proceed (state might be lost on page reload)
        if (storedState && state !== storedState) {
          console.warn('⚠️ State mismatch detected, but proceeding with authentication');
        }
        
        // Remove state from localStorage
        if (storedState) {
          localStorage.removeItem('oauth_state');
        }
        
        setIsLoading(true);
        setError('');
        
        console.log('🔵 Exchanging code for token...');
        
        try {
          // Exchange code for ID token via backend - do this immediately
          const response = await fetch(`${BACKEND_URL}/api/auth/google/callback?code=${encodeURIComponent(code)}&state=${state || ''}`, {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Accept': 'application/json'
            }
          });
          
          console.log('🔵 Backend response status:', response.status);
          console.log('🔵 Request URL:', `${BACKEND_URL}/api/auth/google/callback?code=${code ? 'present' : 'missing'}&state=${state || ''}`);
          
          if (response.ok) {
            const userData = await response.json();
            console.log('✅ Google authentication successful:', userData);
            // Clean URL immediately
            window.history.replaceState({}, document.title, '/login');
            // Remove processed code marker
            sessionStorage.removeItem(processedCodeKey);
            // Check if this is a new user (first time Google login)
            const isNewUser = !userData.existing_user;
            if (isNewUser) {
              localStorage.setItem('moona_is_new_user', 'true');
            }
            // Redirect to dashboard with smooth transition
            setTimeout(() => {
              window.location.href = '/dashboard';
            }, 300);
          } else {
            const errorText = await response.text();
            let errorData;
            try {
              errorData = JSON.parse(errorText);
            } catch {
              errorData = { detail: errorText || 'Google authentication failed' };
            }
            console.error('❌ Backend error:', errorData);
            console.error('❌ Full error response:', errorText);
            console.error('❌ Response status:', response.status);
            
            // Remove processed code marker on error so user can retry
            sessionStorage.removeItem(processedCodeKey);
            
            // Check for specific error types
            if (errorData.detail && errorData.detail.includes('expired or already used')) {
              setError('Authorization code expired. Please click the Gmail button again to get a fresh code.');
            } else if (errorData.detail && (errorData.detail.includes('Database not configured') || errorData.detail.includes('SUPABASE_DB_URL'))) {
              setError('Database not configured. Please set up Supabase. See QUICK_SUPABASE_FIX.md for instructions.');
            } else if (errorData.detail && errorData.detail.includes('Database connection')) {
              setError('Database connection failed. Please check your Supabase configuration in backend/.env');
            } else {
              setError(errorData.detail || 'Google authentication failed. Please try again.');
            }
            // Clean URL
            window.history.replaceState({}, document.title, '/login');
          }
        } catch (error) {
          console.error('❌ Google auth error:', error);
          // Remove processed code marker on error
          sessionStorage.removeItem(processedCodeKey);
          setError(`Google authentication failed: ${error.message}. Please try again.`);
          window.history.replaceState({}, document.title, '/login');
        } finally {
          setIsLoading(false);
          isProcessing = false;
        }
      } else {
        isProcessing = false;
      }
    };

    handleGoogleCallback();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 relative overflow-hidden">
      {/* Animated Moon Background */}
      <AnimatedMoon className="fixed top-20 right-20 pointer-events-none opacity-30" />
      
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-40">
        <div className="absolute inset-0 bg-repeat" style={{
          backgroundImage: "url('data:image/svg+xml,%3Csvg width=\"60\" height=\"60\" viewBox=\"0 0 60 60\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cg fill=\"none\" fill-rule=\"evenodd\"%3E%3Cg fill=\"%239C92AC\" fill-opacity=\"0.1\"%3E%3Ccircle cx=\"30\" cy=\"30\" r=\"1\"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')"
        }}></div>
      </div>
      
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          
          {/* Left Side - Moona Branding */}
          <div className="text-white space-y-6">
            <div className="space-y-3">
              <MoonaLogo size="xl" showTagline={true} className="text-white" />
              <p className="text-lg text-slate-300 max-w-lg leading-relaxed">
                Real-time portfolio insights and calm, clear explanations of your investments.
              </p>
            </div>

            {/* Features Grid - Using same styles as landing page */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="bg-white/10 dark:bg-[#112334] backdrop-blur-md border-white/20 dark:border-[rgba(255,255,255,0.05)] hover:bg-white/15 dark:hover:bg-opacity-80 dark:hover:-translate-y-0.5 transition-all rounded-2xl dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg">
                      <BarChart3 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-sm">Stellar Analytics</h3>
                      <p className="text-xs text-slate-400">Real-time portfolio insights</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/10 dark:bg-[#112334] backdrop-blur-md border-white/20 dark:border-[rgba(255,255,255,0.05)] hover:bg-white/15 dark:hover:bg-opacity-80 dark:hover:-translate-y-0.5 transition-all rounded-2xl dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg">
                      <Shield className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-sm">Cosmic Security</h3>
                      <p className="text-xs text-slate-400">Bank-level protection</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/10 dark:bg-[#112334] backdrop-blur-md border-white/20 dark:border-[rgba(255,255,255,0.05)] hover:bg-white/15 dark:hover:bg-opacity-80 dark:hover:-translate-y-0.5 transition-all rounded-2xl dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg">
                      <Wallet className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-sm">Multi-Asset Galaxy</h3>
                      <p className="text-xs text-slate-400">Stocks, crypto, retirement</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/10 dark:bg-[#112334] backdrop-blur-md border-white/20 dark:border-[rgba(255,255,255,0.05)] hover:bg-white/15 dark:hover:bg-opacity-80 dark:hover:-translate-y-0.5 transition-all rounded-2xl dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg">
                      <TrendingUp className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-sm">Market Constellation</h3>
                      <p className="text-xs text-slate-400">SPY benchmark tracking</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Right Side - Auth Card */}
          <div className="flex justify-center lg:justify-end">
            <Card className="w-full max-w-md bg-slate-800/90 dark:bg-[#112334] backdrop-blur-md border-slate-700/50 dark:border-[rgba(255,255,255,0.05)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] shadow-md rounded-2xl">
              <CardHeader className="text-center pb-4">
                <div className="flex items-center justify-between mb-2">
                  <CardTitle className="text-2xl text-white dark:text-gray-100 font-bold">
                    Welcome Back
                  </CardTitle>
                  <ThemeToggle className="text-white hover:bg-white/10" />
                </div>
                <p className="text-sm text-gray-400 dark:text-gray-300">
                  Sign in to access your investment dashboard
                </p>
              </CardHeader>
              
              <CardContent className="px-6 pb-6">
                <Tabs defaultValue="login" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-6 bg-slate-700/50 rounded-full p-1">
                    <TabsTrigger 
                      value="login" 
                      className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white rounded-full font-medium transition-all"
                    >
                      Sign In
                    </TabsTrigger>
                    <TabsTrigger 
                      value="register" 
                      className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white rounded-full font-medium transition-all"
                    >
                      Sign Up
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="login" className="space-y-4">
                    {error && (
                      <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-sm">
                        {error}
                      </div>
                    )}
                    
                    <form onSubmit={handleMoonaLogin} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="login-email" className="text-gray-300 text-sm">Email</Label>
                        <Input
                          id="login-email"
                          type="email"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            setEmailValid(true);
                            setError('');
                          }}
                          onBlur={() => {
                            if (email && !validateEmail(email)) {
                              setEmailValid(false);
                            }
                          }}
                          placeholder="your.email@example.com"
                          required
                          autoFocus
                          className={`bg-white/10 border-white/20 text-white placeholder-gray-400 ${
                            !emailValid ? 'border-red-500' : ''
                          }`}
                        />
                        {!emailValid && email && (
                          <p className="text-xs text-red-400">Please enter a valid email address</p>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="login-password" className="text-gray-300 text-sm">Password</Label>
                        <Input
                          id="login-password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter your password"
                          required
                          className="bg-slate-700/50 dark:bg-[#112334] border-slate-600 dark:border-[rgba(255,255,255,0.1)] text-white dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-400 rounded-lg"
                        />
                      </div>
                      
                      <Button 
                        type="submit"
                        disabled={isLoading || !email || !password}
                        className="w-full h-12 bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 transition-all duration-200"
                      >
                        {isLoading ? (
                          <span className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Signing in...
                          </span>
                        ) : showSuccess ? (
                          <span className="flex items-center">
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Success! Redirecting...
                          </span>
                        ) : (
                          'Sign In'
                        )}
                      </Button>
                    </form>

                    {/* Trust Line */}
                    <p className="text-xs text-gray-500 text-center mt-4 leading-relaxed">
                      We use read-only connections for your brokerage accounts. Moona cannot move money or place trades.
                    </p>

                    {isGoogleOAuthEnabled() && (
                      <>
                        <div className="relative my-6">
                          <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-slate-600"></span>
                          </div>
                          <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-slate-800 px-2 text-gray-400">Or continue with</span>
                          </div>
                        </div>

                        <Button 
                          onClick={handleGoogleLogin}
                          disabled={isLoading}
                          className="w-full h-12 bg-white text-gray-900 hover:bg-gray-100 disabled:opacity-50 flex items-center justify-center"
                        >
                          <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                          </svg>
                          Continue with Gmail
                        </Button>
                      </>
                    )}
                  </TabsContent>

                  <TabsContent value="register" className="space-y-4">
                    {error && (
                      <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-sm">
                        {error}
                      </div>
                    )}
                    
                    <form onSubmit={handleMoonaRegister} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="register-name" className="text-gray-300 text-sm">Name (Optional)</Label>
                        <Input
                          id="register-name"
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Your name"
                          className="bg-slate-700/50 dark:bg-[#112334] border-slate-600 dark:border-[rgba(255,255,255,0.1)] text-white dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-400 rounded-lg"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="register-email" className="text-gray-300 text-sm">Email</Label>
                        <Input
                          id="register-email"
                          type="email"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            setEmailValid(true);
                            setError('');
                          }}
                          onBlur={() => {
                            if (email && !validateEmail(email)) {
                              setEmailValid(false);
                            }
                          }}
                          placeholder="your.email@example.com"
                          required
                          autoFocus
                          className={`bg-white/10 border-white/20 text-white placeholder-gray-400 ${
                            !emailValid ? 'border-red-500' : ''
                          }`}
                        />
                        {!emailValid && email && (
                          <p className="text-xs text-red-400">Please enter a valid email address</p>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="register-password" className="text-gray-300 text-sm">Password</Label>
                        <Input
                          id="register-password"
                          type="password"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            setError('');
                          }}
                          placeholder="At least 6 characters"
                          required
                          minLength={6}
                          className="bg-slate-700/50 dark:bg-[#112334] border-slate-600 dark:border-[rgba(255,255,255,0.1)] text-white dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-400 rounded-lg"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && email && password && password.length >= 6) {
                              handleMoonaRegister(e);
                            }
                          }}
                        />
                        {password && (
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full transition-all duration-300 ${getPasswordStrengthColor()}`}
                                  style={{ width: `${(passwordStrength / 5) * 100}%` }}
                                />
                              </div>
                              <span className={`text-xs ${
                                passwordStrength <= 1 ? 'text-red-400' :
                                passwordStrength <= 2 ? 'text-orange-400' :
                                passwordStrength <= 3 ? 'text-yellow-400' : 'text-emerald-400'
                              }`}>
                                {getPasswordStrengthText()}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 space-y-0.5">
                              {password.length < 6 && <div>• At least 6 characters</div>}
                              {password.length >= 6 && password.length < 8 && <div>• 8+ characters recommended</div>}
                              {!/[A-Z]/.test(password) && password && <div>• Add uppercase letters</div>}
                              {!/\d/.test(password) && password && <div>• Add numbers</div>}
                              {!/[^a-zA-Z\d]/.test(password) && password && <div>• Add special characters</div>}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <Button 
                        type="submit"
                        disabled={isLoading || !email || !password || password.length < 6}
                        className="w-full h-12 bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 transition-all duration-200"
                      >
                        {isLoading ? (
                          <span className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Creating account...
                          </span>
                        ) : showSuccess ? (
                          <span className="flex items-center">
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Success! Redirecting...
                          </span>
                        ) : (
                          'Create Account'
                        )}
                      </Button>
                    </form>

                    {/* Trust Line */}
                    <p className="text-xs text-gray-500 text-center mt-4 leading-relaxed">
                      We use read-only connections for your brokerage accounts. Moona cannot move money or place trades.
                    </p>

                    {isGoogleOAuthEnabled() && (
                      <>
                        <div className="relative my-6">
                          <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-slate-600"></span>
                          </div>
                          <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-slate-800 px-2 text-gray-400">Or sign up with</span>
                          </div>
                        </div>

                        <Button 
                          onClick={handleGoogleLogin}
                          disabled={isLoading}
                          className="w-full h-12 bg-white text-gray-900 hover:bg-gray-100 disabled:opacity-50 flex items-center justify-center rounded-lg shadow-sm"
                        >
                          <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                          </svg>
                          Sign up with Gmail
                        </Button>
                      </>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
