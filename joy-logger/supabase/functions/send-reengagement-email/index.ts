import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const moodEmojis: { [key: number]: string } = {
  1: "😔",
  2: "😐",
  3: "🙂",
  4: "😊",
  5: "🤩"
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    console.log(`Checking for users with last entry before ${thirtyDaysAgo.toISOString()}`);

    // Get all profiles with email
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email")
      .not("email", "is", null);

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      throw profilesError;
    }

    console.log(`Found ${profiles?.length || 0} total profiles with email`);

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ message: "No profiles found" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    let emailsSent = 0;
    let emailsFailed = 0;
    let usersChecked = 0;

    // Check each user's activity
    for (const profile of profiles) {
      usersChecked++;

      // Get user's most recent entry
      const { data: recentEntries, error: recentError } = await supabase
        .from("journal_entries")
        .select("entry_date, created_at")
        .eq("user_id", profile.id)
        .order("entry_date", { ascending: false })
        .limit(1);

      if (recentError) {
        console.error(`Error checking recent entries for user ${profile.id}:`, recentError);
        emailsFailed++;
        continue;
      }

      // If user has no entries or last entry was 30+ days ago
      const shouldSendEmail = !recentEntries || 
        recentEntries.length === 0 || 
        new Date(recentEntries[0].entry_date) < thirtyDaysAgo;

      if (!shouldSendEmail) {
        continue;
      }

      console.log(`User ${profile.email} inactive for 30+ days, preparing re-engagement email`);

      // Get user's past highlights
      const { data: allEntries, error: entriesError } = await supabase
        .from("journal_entries")
        .select("entry_text, mood_score, entry_date, ai_reflection")
        .eq("user_id", profile.id)
        .order("entry_date", { ascending: false })
        .limit(50);

      if (entriesError) {
        console.error(`Error fetching entries for user ${profile.id}:`, entriesError);
        emailsFailed++;
        continue;
      }

      // Calculate stats
      const totalEntries = allEntries?.length || 0;
      const avgMood = allEntries && allEntries.length > 0
        ? Math.round(allEntries.filter(e => e.mood_score).reduce((sum, e) => sum + (e.mood_score || 0), 0) / allEntries.filter(e => e.mood_score).length)
        : 3;

      // Get best moments (highest mood scores)
      const bestMoments = allEntries
        ?.filter(e => e.mood_score && e.mood_score >= 4)
        .slice(0, 3) || [];

      // Generate highlights HTML
      let highlightsHtml = '';
      if (bestMoments.length > 0) {
        highlightsHtml = bestMoments.map(entry => `
          <div class="highlight">
            <div class="highlight-header">
              <span class="mood">${moodEmojis[entry.mood_score || 3]}</span>
              <span class="date">${new Date(entry.entry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
            <p class="entry-text">"${entry.entry_text}"</p>
          </div>
        `).join('');
      } else if (allEntries && allEntries.length > 0) {
        // If no high mood scores, show most recent entries
        highlightsHtml = allEntries.slice(0, 3).map(entry => `
          <div class="highlight">
            <div class="highlight-header">
              <span class="mood">${moodEmojis[entry.mood_score || 3]}</span>
              <span class="date">${new Date(entry.entry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
            <p class="entry-text">"${entry.entry_text}"</p>
          </div>
        `).join('');
      }

      try {
        const emailResponse = await resend.emails.send({
          from: "OneGoodThing <info@onegoodthingapp.com>",
          to: [profile.email!],
          subject: totalEntries > 0 ? "Remember these good moments? ✨" : "We miss you at OneGoodThing 🌟",
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', 'Satoshi', 'DM Sans', sans-serif;
                  line-height: 1.6;
                  color: #333;
                  max-width: 600px;
                  margin: 0 auto;
                  padding: 20px;
                  background: linear-gradient(135deg, #fff5f0 0%, #fffbf5 100%);
                }
                .container {
                  background: white;
                  border-radius: 16px;
                  padding: 40px;
                  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
                }
                .header {
                  text-align: center;
                  margin-bottom: 32px;
                }
                .logo {
                  font-size: 36px;
                  font-weight: bold;
                  background: linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fbbf24 100%);
                  -webkit-background-clip: text;
                  -webkit-text-fill-color: transparent;
                  background-clip: text;
                  margin-bottom: 8px;
                }
                .hero {
                  text-align: center;
                  font-size: 48px;
                  margin: 32px 0;
                }
                h1 {
                  color: #1a1a1a;
                  font-size: 24px;
                  margin-bottom: 16px;
                }
                p {
                  color: #555;
                  font-size: 16px;
                  margin-bottom: 16px;
                }
                .stats-box {
                  background: linear-gradient(135deg, #fff5f0 0%, #fffbf5 100%);
                  border-radius: 12px;
                  padding: 24px;
                  margin: 24px 0;
                  text-align: center;
                }
                .stat {
                  display: inline-block;
                  margin: 0 20px;
                }
                .stat-number {
                  font-size: 36px;
                  font-weight: bold;
                  color: #f97316;
                  display: block;
                }
                .stat-label {
                  color: #666;
                  font-size: 14px;
                }
                .highlights-section {
                  margin: 32px 0;
                }
                .section-title {
                  color: #f97316;
                  font-size: 18px;
                  font-weight: 600;
                  margin-bottom: 16px;
                }
                .highlight {
                  background: #fafafa;
                  border-left: 4px solid #f97316;
                  padding: 16px;
                  margin: 12px 0;
                  border-radius: 8px;
                }
                .highlight-header {
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  margin-bottom: 8px;
                }
                .mood {
                  font-size: 24px;
                }
                .date {
                  color: #999;
                  font-size: 14px;
                }
                .entry-text {
                  color: #333;
                  font-size: 16px;
                  margin: 0;
                  font-style: italic;
                }
                .message-box {
                  background: #fff5f0;
                  border-radius: 12px;
                  padding: 24px;
                  margin: 24px 0;
                  text-align: center;
                }
                .cta {
                  text-align: center;
                  margin: 32px 0;
                }
                .button {
                  display: inline-block;
                  background: linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fbbf24 100%);
                  color: white !important;
                  padding: 16px 32px;
                  text-decoration: none;
                  border-radius: 12px;
                  font-weight: 600;
                  font-size: 18px;
                  box-shadow: 0 4px 15px rgba(249, 115, 22, 0.3);
                }
                .footer {
                  margin-top: 32px;
                  padding-top: 24px;
                  border-top: 1px solid #eee;
                  text-align: center;
                  color: #999;
                  font-size: 14px;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <div class="logo">OneGoodThing</div>
                </div>

                <div class="hero">${totalEntries > 0 ? '💭' : '🌟'}</div>

                <h1>${totalEntries > 0 ? 'We miss you!' : 'Come back and start fresh!'}</h1>
                
                <p>${totalEntries > 0 
                  ? "It's been a while since we've seen you. We wanted to remind you of some beautiful moments you captured with OneGoodThing."
                  : "It's been 30 days since you joined OneGoodThing. Life gets busy — we get it. But what if today could be the day you start capturing those little moments of joy?"
                }</p>

                ${totalEntries > 0 ? `
                  <div class="stats-box">
                    <div class="stat">
                      <span class="stat-number">${totalEntries}</span>
                      <span class="stat-label">moments saved</span>
                    </div>
                    <div class="stat">
                      <span class="stat-number">${moodEmojis[avgMood]}</span>
                      <span class="stat-label">your vibe</span>
                    </div>
                  </div>

                  ${highlightsHtml ? `
                    <div class="highlights-section">
                      <div class="section-title">✨ Your Best Moments</div>
                      ${highlightsHtml}
                    </div>
                  ` : ''}

                  <div class="message-box">
                    <p style="margin-bottom: 12px; font-size: 18px;">💫</p>
                    <p><strong style="color: #f97316;">These moments are worth continuing.</strong></p>
                    <p style="margin-bottom: 0; color: #666;">You've already built something beautiful. Don't let it fade. Add one more good thing today.</p>
                  </div>
                ` : `
                  <div class="message-box">
                    <p style="margin-bottom: 12px; font-size: 18px;">🌱</p>
                    <p><strong style="color: #f97316;">Today is a perfect day to start.</strong></p>
                    <p style="margin-bottom: 0; color: #666;">Just write one line about something good that happened. A warm drink. A kind word. A moment of peace. That's all it takes.</p>
                  </div>
                `}

                <div class="cta">
                  <a href="https://onegoodthingapp.com" class="button">
                    ${totalEntries > 0 ? 'Continue Your Journey ✨' : 'Start Your First Entry ✨'}
                  </a>
                </div>

                <p style="text-align: center; color: #666; font-size: 14px; margin-top: 24px;">
                  ${totalEntries > 0 
                    ? 'We saved these moments for you. Come back and add to them 🌟'
                    : 'Your story begins with one moment. Start today 🌟'
                  }
                </p>

                <div class="footer">
                  <p>${totalEntries > 0 
                    ? 'Your journey is waiting for you.'
                    : 'Thousands of people find joy every day with OneGoodThing.'
                  }</p>
                </div>
              </div>
            </body>
            </html>
          `,
        });

        console.log(`Re-engagement email sent to ${profile.email}:`, emailResponse);
        emailsSent++;
      } catch (emailError: any) {
        console.error(`Failed to send email to ${profile.email}:`, emailError);
        emailsFailed++;
      }
    }

    return new Response(
      JSON.stringify({
        message: `Re-engagement email check complete`,
        emailsSent,
        emailsFailed,
        usersChecked,
        totalProfiles: profiles.length,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-reengagement-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
