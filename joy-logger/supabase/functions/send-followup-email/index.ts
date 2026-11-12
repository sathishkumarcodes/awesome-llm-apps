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

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate date range for 7 days ago (within 24-hour window)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const eightDaysAgo = new Date();
    eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

    console.log(`Checking for users created between ${eightDaysAgo.toISOString()} and ${sevenDaysAgo.toISOString()}`);

    // Get users who signed up 7 days ago
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, created_at")
      .gte("created_at", eightDaysAgo.toISOString())
      .lte("created_at", sevenDaysAgo.toISOString())
      .not("email", "is", null);

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      throw profilesError;
    }

    console.log(`Found ${profiles?.length || 0} profiles created 7 days ago`);

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ message: "No users found who signed up 7 days ago" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    let emailsSent = 0;
    let emailsFailed = 0;

    // Check each user for journal entries
    for (const profile of profiles) {
      // Check if user has any journal entries
      const { data: entries, error: entriesError } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("user_id", profile.id)
        .limit(1);

      if (entriesError) {
        console.error(`Error checking entries for user ${profile.id}:`, entriesError);
        emailsFailed++;
        continue;
      }

      // If user has no entries, send follow-up email
      if (!entries || entries.length === 0) {
        console.log(`Sending follow-up email to ${profile.email}`);

        try {
          const emailResponse = await resend.emails.send({
            from: "OneGoodThing <info@onegoodthingapp.com>",
            to: [profile.email!],
            subject: "Still thinking about your first good thing? ✨",
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
                  .tip {
                    background: linear-gradient(135deg, #fff5f0 0%, #fffbf5 100%);
                    border-left: 4px solid #f97316;
                    padding: 16px;
                    margin: 16px 0;
                    border-radius: 8px;
                  }
                  .tip strong {
                    color: #f97316;
                    display: block;
                    margin-bottom: 8px;
                  }
                  .examples {
                    background: #fafafa;
                    border-radius: 12px;
                    padding: 20px;
                    margin: 24px 0;
                  }
                  .examples ul {
                    margin: 12px 0;
                    padding-left: 20px;
                  }
                  .examples li {
                    color: #666;
                    margin: 8px 0;
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
                  .reassurance {
                    background: #fff5f0;
                    border-radius: 12px;
                    padding: 24px;
                    margin: 24px 0;
                    text-align: center;
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

                  <div class="hero">🌱</div>

                  <h1>Hey there!</h1>
                  
                  <p>It's been a week since you joined OneGoodThing, and we noticed you haven't written your first entry yet.</p>

                  <p>That's totally okay — starting something new can feel hard. So we wanted to share some tips to make it easier:</p>

                  <div class="tip">
                    <strong>💭 You don't need a "perfect" moment</strong>
                    <p style="margin-bottom: 0; color: #666;">The smallest things count. A good coffee, a smile from a stranger, or just making it through a tough day.</p>
                  </div>

                  <div class="tip">
                    <strong>⏱️ It takes 30 seconds</strong>
                    <p style="margin-bottom: 0; color: #666;">Just one line. You don't need to write a novel — a simple sentence is perfect.</p>
                  </div>

                  <div class="tip">
                    <strong>🎯 Pick any moment from today</strong>
                    <p style="margin-bottom: 0; color: #666;">Look back at your day. What made you smile? What felt peaceful? What relieved you?</p>
                  </div>

                  <div class="examples">
                    <strong style="color: #333; display: block; margin-bottom: 12px;">Here are some real examples from our community:</strong>
                    <ul>
                      <li>"My dog wagged his tail when I came home"</li>
                      <li>"I got through a hard meeting without panicking"</li>
                      <li>"The sunset was beautiful on my walk"</li>
                      <li>"My kid laughed at my joke"</li>
                      <li>"I finally finished that task I was avoiding"</li>
                    </ul>
                  </div>

                  <div class="reassurance">
                    <p style="margin-bottom: 12px; font-size: 18px;">💫</p>
                    <p><strong style="color: #f97316;">You'll feel better after writing just one entry.</strong></p>
                    <p style="margin-bottom: 0; color: #666;">Thousands of people have told us this: capturing one good thing shifts your whole perspective. Just try it once.</p>
                  </div>

                  <div class="cta">
                    <a href="https://onegoodthingapp.com" class="button">
                      Write Your First Entry ✨
                    </a>
                  </div>

                  <p style="text-align: center; color: #666; font-size: 14px; margin-top: 24px;">
                    Start today. Your streak begins with just one moment 🌟
                  </p>

                  <div class="footer">
                    <p>We believe in you. This practice will make a difference.</p>
                  </div>
                </div>
              </body>
              </html>
            `,
          });

          console.log(`Follow-up email sent to ${profile.email}:`, emailResponse);
          emailsSent++;
        } catch (emailError: any) {
          console.error(`Failed to send email to ${profile.email}:`, emailError);
          emailsFailed++;
        }
      } else {
        console.log(`User ${profile.email} already has entries, skipping`);
      }
    }

    return new Response(
      JSON.stringify({
        message: `Follow-up email check complete`,
        emailsSent,
        emailsFailed,
        totalChecked: profiles.length,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-followup-email function:", error);
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
