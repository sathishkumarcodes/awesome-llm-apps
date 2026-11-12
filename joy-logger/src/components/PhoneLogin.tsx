import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Phone, Loader2, ArrowLeft } from "lucide-react";

type PhoneLoginStep = "phone" | "otp";

export const PhoneLogin = () => {
  const [step, setStep] = useState<PhoneLoginStep>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const formatPhoneNumber = (value: string): string => {
    // Remove all non-numeric characters
    const cleaned = value.replace(/\D/g, "");
    
    // Add +1 prefix if not present
    if (cleaned.length > 0 && !cleaned.startsWith("1")) {
      return `+1${cleaned}`;
    }
    return `+${cleaned}`;
  };

  const validatePhoneNumber = (phone: string): boolean => {
    // Should be in format +1XXXXXXXXXX (11 digits total including country code)
    const phoneRegex = /^\+1\d{10}$/;
    return phoneRegex.test(phone);
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const formattedPhone = formatPhoneNumber(phone);
    
    if (!validatePhoneNumber(formattedPhone)) {
      toast.error("Please enter a valid US phone number");
      return;
    }

    setIsLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      phone: formattedPhone,
    });

    setIsLoading(false);

    if (error) {
      toast.error(error.message);
    } else {
      setPhone(formattedPhone);
      setStep("otp");
      toast.success("OTP sent to your phone!");
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();

    if (otp.length !== 6) {
      toast.error("Please enter a 6-digit OTP");
      return;
    }

    setIsLoading(true);

    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token: otp,
      type: "sms",
    });

    if (error) {
      setIsLoading(false);
      toast.error(error.message);
      return;
    }

    // Update profile with phone number
    if (data.user) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ phone })
        .eq("id", data.user.id);

      if (updateError) {
        console.error("Error updating profile:", updateError);
      }
    }

    setIsLoading(false);
    toast.success("Phone verified successfully!");
  };

  const handleBack = () => {
    setStep("phone");
    setOtp("");
  };

  if (step === "otp") {
    return (
      <div className="space-y-4 animate-fade-up">
        <Button
          variant="ghost"
          onClick={handleBack}
          disabled={isLoading}
          className="mb-2 hover:scale-[1.02] transition-all"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Enter the 6-digit code sent to {phone}
          </label>
          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={otp}
                onChange={setOtp}
                disabled={isLoading}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>

            <Button
              type="submit"
              disabled={isLoading || otp.length !== 6}
              className="w-full bg-gradient-to-r from-primary to-primary-glow hover:shadow-glow transition-all hover:scale-[1.02]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify OTP"
              )}
            </Button>
          </form>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Didn't receive the code?{" "}
          <button
            onClick={() => setStep("phone")}
            className="text-primary hover:underline"
            disabled={isLoading}
          >
            Try again
          </button>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSendOTP} className="space-y-4 animate-fade-up">
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Phone Number</label>
        <Input
          type="tel"
          placeholder="+1 (555) 123-4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={isLoading}
          className="border-2 transition-all focus:scale-[1.02]"
        />
        <p className="text-xs text-muted-foreground">
          Enter your US phone number (we'll send you a code)
        </p>
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
            <Phone className="mr-2 h-4 w-4" />
            Send OTP
          </>
        )}
      </Button>
    </form>
  );
};
