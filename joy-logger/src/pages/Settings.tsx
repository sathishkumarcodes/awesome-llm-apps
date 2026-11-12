import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Download, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const Settings = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [reminderHour, setReminderHour] = useState(20);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    } else if (user) {
      loadProfile();
    }
  }, [user, authLoading, navigate]);

  const loadProfile = async () => {
    try {
      // Load profile
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user?.id)
        .single();

      if (profileError) throw profileError;

      // Load preferences
      const { data: prefsData } = await supabase
        .from("user_preferences" as any)
        .select("*")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (profileData) {
        setEmail(profileData.email || user?.email || "");
        setTimezone((prefsData as any)?.timezone || "UTC");
        setReminderHour(
          (prefsData as any)?.reminder_time 
            ? parseInt((prefsData as any).reminder_time.split(':')[0]) 
            : 19
        );
        setReminderEnabled((prefsData as any)?.reminder_enabled ?? false);
        setAiEnabled(profileData.ai_enabled ?? true);
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update AI preferences in profiles
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          ai_enabled: aiEnabled,
        })
        .eq("id", user?.id);

      if (profileError) throw profileError;

      // Upsert reminder preferences
      const reminderTime = `${String(reminderHour).padStart(2, '0')}:00:00`;
      const { error: prefsError } = await supabase
        .from("user_preferences" as any)
        .upsert({
          user_id: user?.id,
          reminder_enabled: reminderEnabled,
          reminder_time: reminderTime,
          timezone: timezone,
        }, {
          onConflict: 'user_id'
        });

      if (prefsError) throw prefsError;

      toast.success("Settings saved! You'll receive daily reminders at your chosen time.", {
        duration: 4000,
      });
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast.error(error.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    try {
      const { data, error } = await supabase
        .from("journal_entries")
        .select("*")
        .eq("user_id", user?.id)
        .order("entry_date", { ascending: true });

      if (error) throw error;

      const csv = [
        "Date,Entry,AI Reflection",
        ...data.map(entry => 
          `"${entry.entry_date}","${entry.entry_text.replace(/"/g, '""')}","${(entry.ai_reflection || '').replace(/"/g, '""')}"`
        )
      ].join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gratitude-journal-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("Journal exported!");
    } catch (error: any) {
      console.error("Error exporting journal:", error);
      toast.error(error.message || "Failed to export journal");
    }
  };

  const handleDeleteAccount = async () => {
    try {
      // Delete all entries first
      const { error: entriesError } = await supabase
        .from("journal_entries")
        .delete()
        .eq("user_id", user?.id);

      if (entriesError) throw entriesError;

      // Delete profile
      const { error: profileError } = await supabase
        .from("profiles")
        .delete()
        .eq("id", user?.id);

      if (profileError) throw profileError;

      // Sign out and redirect
      await signOut();
      toast.success("Account deleted");
      navigate("/auth");
    } catch (error: any) {
      console.error("Error deleting account:", error);
      toast.error(error.message || "Failed to delete account");
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-accent/20 to-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/20 to-background">
      <div className="container max-w-2xl mx-auto px-4 py-12">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          </div>

          <Card className="p-6 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={email} disabled className="bg-muted" />
              </div>

              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="America/New_York">Eastern Time</SelectItem>
                    <SelectItem value="America/Chicago">Central Time</SelectItem>
                    <SelectItem value="America/Denver">Mountain Time</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                    <SelectItem value="Europe/London">London</SelectItem>
                    <SelectItem value="Europe/Paris">Paris</SelectItem>
                    <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                    <SelectItem value="Asia/Shanghai">Shanghai</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Daily Reminder Time</Label>
                <Select 
                  value={reminderHour.toString()} 
                  onValueChange={(v) => setReminderHour(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="19">7:00 PM</SelectItem>
                    <SelectItem value="20">8:00 PM</SelectItem>
                    <SelectItem value="21">9:00 PM</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Daily Reminders</Label>
                  <p className="text-sm text-muted-foreground">
                    Don't forget to save today's good thing ✨
                  </p>
                </div>
                <Switch checked={reminderEnabled} onCheckedChange={setReminderEnabled} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>AI Reflections</Label>
                  <p className="text-sm text-muted-foreground">
                    Generate AI reflections for entries
                  </p>
                </div>
                <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Settings"
              )}
            </Button>
          </Card>

          <Card className="p-6 space-y-4">
            <h2 className="text-xl font-semibold text-foreground">Data</h2>
            
            <Button onClick={handleExport} variant="outline" className="w-full">
              <Download className="mr-2 h-4 w-4" />
              Export Journal
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete your
                    account and all your journal entries.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteAccount} className="bg-destructive">
                    Delete Everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Settings;