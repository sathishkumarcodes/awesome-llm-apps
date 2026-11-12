import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation
interface MonthlyReflectionInput {
  monthStart: string;
  monthEnd: string;
}

const validateInput = (input: any): { valid: boolean; data?: MonthlyReflectionInput; error?: string } => {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  const { monthStart, monthEnd } = input;

  if (typeof monthStart !== 'string' || typeof monthEnd !== 'string') {
    return { valid: false, error: 'monthStart and monthEnd must be strings' };
  }

  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(monthStart) || !dateRegex.test(monthEnd)) {
    return { valid: false, error: 'monthStart and monthEnd must be in YYYY-MM-DD format' };
  }

  return { valid: true, data: { monthStart, monthEnd } };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract and validate user from JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    const body = await req.json();
    
    // Validate input
    const validation = validateInput(body);
    if (!validation.valid) {
      console.error('Validation error:', validation.error);
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { monthStart, monthEnd } = validation.data!;

    // Fetch entries for the month
    const { data: entries, error: entriesError } = await supabase
      .from('journal_entries')
      .select('entry_date, entry_text, mood_score, tags, ai_reflection')
      .eq('user_id', userId)
      .gte('entry_date', monthStart)
      .lte('entry_date', monthEnd)
      .order('entry_date', { ascending: true });

    if (entriesError) throw entriesError;

    if (!entries || entries.length < 3) {
      return new Response(
        JSON.stringify({ error: 'Not enough entries for this month' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate stats
    const daysTracked = entries.length;
    const avgMood = entries.reduce((sum, e) => sum + (e.mood_score || 0), 0) / entries.length;
    const themeCounts: { [key: string]: number } = {};
    
    entries.forEach(entry => {
      entry.tags?.forEach((tag: string) => {
        themeCounts[tag] = (themeCounts[tag] || 0) + 1;
      });
    });

    const positivity = avgMood >= 4 ? "High" : avgMood >= 3 ? "Good" : "Growing";

    // Build prompt for AI
    const entriesText = entries.map(e => 
      `${e.entry_date}: ${e.entry_text}${e.mood_score ? ` (mood: ${e.mood_score}/5)` : ''}`
    ).join('\n');

    const topThemes = Object.entries(themeCounts)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 5)
      .map(([theme, count]) => `${theme} (${count} times)`)
      .join(', ');

    const systemPrompt = `You are a compassionate life coach analyzing someone's monthly journal entries. Create a warm, personalized monthly reflection that celebrates their journey and growth.

Your reflection should include:
1. A heartfelt summary (3-4 sentences) that captures the essence of their month
2. 3-5 specific highlights from their entries
3. Patterns and themes you noticed

Be authentic, encouraging, and specific. Reference actual moments from their entries. Use a warm, conversational tone as if you're a supportive friend.`;

    const userPrompt = `Here are the journal entries for this month:

${entriesText}

Statistics:
- Days tracked: ${daysTracked}
- Average mood: ${avgMood.toFixed(1)}/5
- Top themes: ${topThemes || 'None tagged'}

Create a beautiful monthly reflection that celebrates this person's journey. Format your response as:
SUMMARY: [Your warm 3-4 sentence summary]
HIGHLIGHTS:
- [Highlight 1]
- [Highlight 2]
- [Highlight 3]
(etc)`;

    // Call Lovable AI
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI service unavailable' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const reflectionText = aiData.choices[0].message.content;

    // Parse the AI response
    const summaryMatch = reflectionText.match(/SUMMARY:\s*(.+?)(?=HIGHLIGHTS:|$)/s);
    const highlightsMatch = reflectionText.match(/HIGHLIGHTS:\s*(.+?)$/s);
    
    const summary = summaryMatch ? summaryMatch[1].trim() : reflectionText;
    const highlights = highlightsMatch 
      ? highlightsMatch[1].trim().split('\n').filter((h: string) => h.trim().startsWith('-')).map((h: string) => h.replace(/^-\s*/, '').trim())
      : [];

    const reflection = {
      summary,
      highlights,
      themes: themeCounts,
      joyStats: {
        daysTracked,
        avgMood: Number(avgMood.toFixed(1)),
        positivity
      }
    };

    return new Response(
      JSON.stringify({ reflection }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error generating monthly reflection:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
