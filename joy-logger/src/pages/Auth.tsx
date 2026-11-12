import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, Mail, Loader2 } from "lucide-react";
import FloatingParticles from "@/components/FloatingParticles";
import SignInCelebration from "@/components/SignInCelebration";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setShowCelebration(true);
        
        // Check if this is a new user (profile just created in the last minute)
        const { data: profile } = await supabase
          .from('profiles')
          .select('created_at')
          .eq('id', session.user.id)
          .single();
        
        if (profile) {
          const profileAge = Date.now() - new Date(profile.created_at).getTime();
          const isNewUser = profileAge < 60000; // Less than 1 minute old
          
          // Send welcome email for new users
          if (isNewUser && session.user.email) {
            try {
              await supabase.functions.invoke('send-welcome-email', {
                body: {
                  email: session.user.email,
                },
              });
              console.log('Welcome email sent to new user');
            } catch (error) {
              console.error('Error sending welcome email:', error);
            }
          }
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email");
      return;
    }

    setIsLoading(true);
    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    setIsLoading(false);

    if (error) {
      toast.error(error.message);
    } else {
      setEmailSent(true);
      toast.success("Check your email for the magic link!");
    }
  };

  const handleGoogleSignIn = async () => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (error) {
      toast.error(error.message);
    }
  };

  if (emailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-accent/20 to-background p-4">
        <FloatingParticles />
        <Card className="p-8 max-w-md w-full text-center space-y-4 animate-scale-in">
          <Mail className="w-16 h-16 mx-auto text-primary animate-float" />
          <h2 className="text-2xl font-bold text-foreground">Check your email</h2>
          <p className="text-muted-foreground">
            We've sent a magic link to <strong>{email}</strong>
          </p>
          <p className="text-sm text-muted-foreground">
            Click the link in your email to sign in
          </p>
          <Button variant="outline" onClick={() => setEmailSent(false)} className="w-full hover:scale-[1.02] transition-all">
            Try a different email
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-accent/20 to-background p-4">
      <FloatingParticles />
      {showCelebration && <SignInCelebration onComplete={() => navigate("/")} />}
      <Card className="p-8 max-w-md w-full space-y-6 animate-fade-up">
        <div className="text-center space-y-4">
          <Sparkles className="w-12 h-12 mx-auto text-primary animate-float" />
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
            OneGoodThing
          </h1>
          <p className="text-lg font-medium text-foreground">
            Capture one meaningful moment each day.
          </p>
          <p className="text-sm text-muted-foreground">
            A simple daily habit that helps you feel happier and more grateful.
          </p>
        </div>

        <form onSubmit={handleMagicLink} className="space-y-4 animate-fade-up" style={{ animationDelay: "0.1s", animationFillMode: "both" }}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Email</label>
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="border-2 transition-all focus:scale-[1.02]"
            />
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-primary to-primary-glow hover:shadow-glow transition-all hover:scale-[1.02]"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Send Magic Link
              </>
            )}
          </Button>
        </form>

        <div className="relative animate-fade-up" style={{ animationDelay: "0.2s", animationFillMode: "both" }}>
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
          </div>
        </div>

        <Button
          onClick={handleGoogleSignIn}
          variant="outline"
          className="w-full animate-fade-up hover:scale-[1.02] transition-all"
          style={{ animationDelay: "0.3s", animationFillMode: "both" }}
        >
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Sign in with Google
        </Button>
      </Card>
    </div>
  );
};

export default Auth;