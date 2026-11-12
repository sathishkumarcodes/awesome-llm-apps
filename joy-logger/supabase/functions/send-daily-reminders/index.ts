import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UserToRemind {
  id: string;
  email: string;
  reminder_hour: number;
  reminder_enabled: boolean;
  timezone: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting daily reminders check...");
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current hour in UTC
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    
    console.log(`Current UTC time: ${currentHour}:${currentMinute}`);

    // Find users who should receive reminders at this hour
    const { data: usersToRemind, error: usersError } = await supabase
      .from("profiles")
      .select("id, email, reminder_hour, reminder_enabled, timezone")
      .eq("reminder_enabled", true);

    if (usersError) {
      console.error("Error fetching users:", usersError);
      throw usersError;
    }

    if (!usersToRemind || usersToRemind.length === 0) {
      console.log("No users with reminders enabled");
      return new Response(
        JSON.stringify({ message: "No users to remind" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${usersToRemind.length} users with reminders enabled`);

    // Check if user has already logged today
    const today = now.toISOString().split('T')[0];
    
    const emailsSent: string[] = [];
    const errors: string[] = [];

    for (const user of usersToRemind) {
      try {
        // Check if user has already logged today
        const { data: todayEntry } = await supabase
          .from("journal_entries")
          .select("id")
          .eq("user_id", user.id)
          .eq("entry_date", today)
          .single();

        if (todayEntry) {
          console.log(`User ${user.id} already logged today, skipping`);
          continue;
        }

        // Check if it's the right hour for this user
        if (user.reminder_hour === currentHour) {
          if (!user.email) {
            console.log(`No email for user ${user.id}`);
            continue;
          }

          // Fetch user's last entry for personalization
          const { data: lastEntry } = await supabase
            .from("journal_entries")
            .select("entry_text, entry_date, mood_score")
            .eq("user_id", user.id)
            .order("entry_date", { ascending: false })
            .limit(1)
            .single();

          // Calculate streak
          const { data: allEntries } = await supabase
            .from("journal_entries")
            .select("entry_date")
            .eq("user_id", user.id)
            .order("entry_date", { ascending: false });

          let streakCount = 0;
          if (allEntries && allEntries.length > 0) {
            const dates = allEntries.map(e => e.entry_date);
            let currentDate = new Date(dates[0]);
            streakCount = 1;
            
            for (let i = 1; i < dates.length; i++) {
              const prevDate = new Date(dates[i]);
              const diffDays = Math.floor((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
              
              if (diffDays === 1) {
                streakCount++;
                currentDate = prevDate;
              } else {
                break;
              }
            }
          }

          // Get total days for journey count
          const { count: totalDays } = await supabase
            .from("journal_entries")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id);

          const journeyDay = (totalDays || 0) + 1;

          // Create personalized content
          const lastEntryText = lastEntry ? lastEntry.entry_text.substring(0, 60) + (lastEntry.entry_text.length > 60 ? "..." : "") : "";
          const moodEmoji = lastEntry?.mood_score ? ["😔", "😕", "😐", "🙂", "😊"][lastEntry.mood_score - 1] : "✨";
          
          const reflectiveQuestions = [
            "What made today worth remembering?",
            "Who made your day better?",
            "What small moment brought you peace today?",
            "What are you grateful for right now?",
            "What made you smile today?"
          ];
          const reflectiveQuestion = reflectiveQuestions[Math.floor(Math.random() * reflectiveQuestions.length)];

          // Send reminder email
          const { error: emailError } = await resend.emails.send({
            from: "OneGoodThing <info@onegoodthingapp.com>",
            to: [user.email],
            subject: streakCount > 0 ? `Day ${streakCount + 1} — What's your good thing today?` : "✨ What's your good thing today?",
            html: `
              <!DOCTYPE html>
              <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #FFF8F0;">
                  <div style="max-width: 600px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
                    <!-- Header with gradient -->
                    <div style="background: linear-gradient(135deg, #FFA726 0%, #FF7043 100%); padding: 40px 30px; text-align: center;">
                      <div style="width: 60px; height: 60px; background: white; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; font-size: 32px;">
                        ☀️
                      </div>
                      <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 600; letter-spacing: -0.5px;">
                        ${streakCount > 0 ? `Day ${streakCount + 1}` : 'Your Daily Moment'}
                      </h1>
                    </div>

                    <!-- Content -->
                    <div style="padding: 40px 30px;">
                      ${streakCount > 0 ? `
                        <div style="background: linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%); border-radius: 12px; padding: 20px; margin-bottom: 30px; border-left: 4px solid #FF9800;">
                          <p style="margin: 0; color: #E65100; font-size: 16px; font-weight: 600;">
                            🔥 ${streakCount} day streak — you're on a roll!
                          </p>
                          <p style="margin: 8px 0 0 0; color: #BF360C; font-size: 14px;">
                            Each day you show up adds more light to your week.
                          </p>
                        </div>
                      ` : ''}

                      ${lastEntryText ? `
                        <div style="background: #F5F5F5; border-radius: 12px; padding: 20px; margin-bottom: 30px;">
                          <p style="margin: 0 0 8px 0; color: #666; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                            Last time you wrote about
                          </p>
                          <p style="margin: 0; color: #333; font-size: 16px; font-style: italic;">
                            "${lastEntryText}"
                          </p>
                        </div>
                      ` : ''}

                      <div style="margin-bottom: 30px;">
                        <p style="margin: 0 0 12px 0; color: #444; font-size: 18px; font-weight: 500; line-height: 1.6;">
                          ${reflectiveQuestion}
                        </p>
                        <p style="margin: 0; color: #666; font-size: 15px; line-height: 1.6;">
                          Take a moment to notice something good — even the smallest moments count.
                        </p>
                      </div>

                      <!-- CTA Button -->
                      <div style="text-align: center; margin: 40px 0;">
                        <a href="https://onegoodthingapp.com" 
                           style="display: inline-block; background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%); color: white; text-decoration: none; padding: 16px 40px; border-radius: 30px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(255, 152, 0, 0.3); transition: transform 0.2s;">
                          ✨ Write Your Good Thing
                        </a>
                      </div>

                      ${(totalDays || 0) > 0 ? `
                        <div style="text-align: center; padding: 20px 0; border-top: 1px solid #EEEEEE; margin-top: 30px;">
                          <p style="margin: 0; color: #888; font-size: 13px;">
                            You've captured ${totalDays} beautiful ${totalDays === 1 ? 'moment' : 'moments'} so far
                          </p>
                        </div>
                      ` : ''}
                    </div>

                    <!-- Footer -->
                    <div style="background: #F9F9F9; padding: 30px; text-align: center; border-top: 1px solid #EEEEEE;">
                      <p style="margin: 0 0 15px 0; color: #666; font-size: 14px;">
                        <strong>OneGoodThing</strong> — Find a little light in your day
                      </p>
                      <p style="margin: 0; color: #999; font-size: 12px;">
                        Don't want daily reminders? 
                        <a href="https://onegoodthingapp.com/settings" style="color: #FF9800; text-decoration: none;">Update your preferences</a>
                      </p>
                    </div>
                  </div>
                </body>
              </html>
            `,
            text: `
OneGoodThing

${streakCount > 0 ? `🔥 ${streakCount}-day streak\n\n` : ''}${streakCount > 0 ? "You're on a roll." : "A moment just for you."}

${lastEntry ? `Yesterday, you reflected on: "${lastEntryText}" ${moodEmoji}\n\n` : `Today is day ${journeyDay} of your journey.\n\n`}${streakCount > 0 ? "Each day you show up, you're building something meaningful. Keep going.\n\n" : ''}${reflectiveQuestion}

It doesn't have to be big. A kind word, a quiet moment, something that made you pause — that counts.

Capture today's moment: https://onegoodthingapp.com

---
This is day ${journeyDay} of your journey.
Change your reminder time or turn these off: https://onegoodthingapp.com/settings
            `.trim(),
          });

          if (emailError) {
            console.error(`Failed to send email to ${user.email}:`, emailError);
            errors.push(`${user.email}: ${emailError.message}`);
          } else {
            console.log(`Sent reminder to ${user.email}`);
            emailsSent.push(user.email);
          }
        }
      } catch (error: any) {
        console.error(`Error processing user ${user.id}:`, error);
        errors.push(`${user.id}: ${error.message}`);
      }
    }

    console.log(`Reminders sent: ${emailsSent.length}, Errors: ${errors.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        emailsSent: emailsSent.length,
        errors: errors.length > 0 ? errors : undefined,
        recipients: emailsSent,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in send-daily-reminders:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);
