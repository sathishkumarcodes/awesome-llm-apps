import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WelcomeEmailRequest {
  email: string;
  name?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, name }: WelcomeEmailRequest = await req.json();

    console.log(`Sending welcome email to: ${email}`);

    const displayName = name || "Friend";

    const emailResponse = await resend.emails.send({
      from: "OneGoodThing <info@onegoodthingapp.com>",
      to: [email],
      subject: "Welcome to OneGoodThing ☀️",
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
            .subtitle {
              color: #666;
              font-size: 16px;
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
            .benefit {
              background: linear-gradient(135deg, #fff5f0 0%, #fffbf5 100%);
              border-left: 4px solid #f97316;
              padding: 16px;
              margin: 16px 0;
              border-radius: 8px;
            }
            .benefit strong {
              color: #f97316;
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
            .promise {
              background: #fff5f0;
              border-radius: 12px;
              padding: 24px;
              margin: 24px 0;
              text-align: center;
            }
            .promise strong {
              color: #f97316;
              font-size: 18px;
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
              <div class="subtitle">Find a little light in your day ☀️</div>
            </div>

            <div class="hero">🌅</div>

            <h1>Welcome, ${displayName}!</h1>
            
            <p>We're so glad you're here. You've just taken the first step toward a more positive, mindful life — and it only takes 30 seconds a day.</p>

            <div class="benefit">
              <strong>✨ What is OneGoodThing?</strong>
              <p style="margin-top: 8px; margin-bottom: 0;">Every day, you'll capture just ONE good thing that happened — no matter how small. A kind word, a warm coffee, a moment of peace. That's it.</p>
            </div>

            <div class="benefit">
              <strong>🧠 Why it works:</strong>
              <p style="margin-top: 8px; margin-bottom: 0;">This simple practice rewires your brain to notice more joy, build gratitude, and feel lighter — even on tough days.</p>
            </div>

            <div class="benefit">
              <strong>🔥 Build your streak:</strong>
              <p style="margin-top: 8px; margin-bottom: 0;">Each day you show up adds to your streak. Watch your momentum grow and celebrate milestones along the way.</p>
            </div>

            <div class="benefit">
              <strong>🤖 AI-powered insights:</strong>
              <p style="margin-top: 8px; margin-bottom: 0;">Get personalized reflections and discover patterns in what brings you joy over time.</p>
            </div>

            <div class="promise">
              <p style="margin-bottom: 12px; font-size: 18px;">💫</p>
              <p><strong>We promise: You'll see a difference.</strong></p>
              <p style="margin-bottom: 0; color: #666;">Just write your first entry, and you'll understand why thousands of people do this every single day.</p>
            </div>

              <div class="cta">
                <a href="https://onegoodthingapp.com" class="button">
                  Write Your First Entry ✨
                </a>
              </div>

            <p style="text-align: center; color: #666; font-size: 14px; margin-top: 24px;">
              Start today — your future self will thank you 🌟
            </p>

            <div class="footer">
              <p>You're receiving this email because you signed up for OneGoodThing.</p>
              <p>We'll send you a gentle daily reminder to help you build this life-changing habit.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Welcome email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-welcome-email function:", error);
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
