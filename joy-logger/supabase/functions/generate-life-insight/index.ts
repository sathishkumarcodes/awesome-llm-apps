import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation - no longer accepts userId from client
const validateInput = (input: any): { valid: boolean; error?: string } => {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  return { valid: true };
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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('AI service not configured');
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Database not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

    // Fetch recent entries (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data: entries, error } = await supabase
      .from('journal_entries')
      .select('entry_text, mood_score, entry_date, ai_reflection')
      .eq('user_id', userId)
      .gte('entry_date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('entry_date', { ascending: false })
      .limit(30);

    if (error) {
      console.error('Database error:', error);
      throw new Error('Failed to fetch entries');
    }

    if (!entries || entries.length === 0) {
      return new Response(
        JSON.stringify({ insight: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate mood statistics
    const moodEntries = entries.filter(e => e.mood_score !== null);
    const avgMood = moodEntries.length > 0 
      ? (moodEntries.reduce((sum, e) => sum + (e.mood_score || 0), 0) / moodEntries.length).toFixed(1)
      : null;
    
    const moodTrend = moodEntries.length >= 3 ? (() => {
      const recent = moodEntries.slice(0, Math.ceil(moodEntries.length / 2));
      const older = moodEntries.slice(Math.ceil(moodEntries.length / 2));
      const recentAvg = recent.reduce((sum, e) => sum + (e.mood_score || 0), 0) / recent.length;
      const olderAvg = older.reduce((sum, e) => sum + (e.mood_score || 0), 0) / older.length;
      
      if (recentAvg > olderAvg + 0.5) return "improving";
      if (recentAvg < olderAvg - 0.5) return "declining";
      return "stable";
    })() : "stable";

    // Prepare detailed entries summary for AI with mood analysis
    const entriesSummary = entries.map(e => {
      const moodLabel = e.mood_score === 1 ? "rough/struggling" : 
                       e.mood_score === 2 ? "meh/low" : 
                       e.mood_score === 3 ? "okay/neutral" : 
                       e.mood_score === 4 ? "good/positive" : 
                       e.mood_score === 5 ? "great/joyful" : "not tracked";
      return `${e.entry_date}: "${e.entry_text}" [mood: ${moodLabel}]`;
    }).join('\n');

    const systemPrompt = `You are analyzing someone's journal entries to provide a deeply personalized, accurate reflection of their life RIGHT NOW.

CRITICAL INSTRUCTIONS:
- Base EVERYTHING on the actual entries provided - mood scores, themes, and specific content
- If mood is "improving", acknowledge their positive momentum
- If mood is "declining", acknowledge challenges with compassion
- If mood is "stable", note their consistency
- Identify SPECIFIC recurring themes from their actual entries (e.g., work, relationships, hobbies, nature, creativity, health)
- Reference the ACTUAL emotional state shown in their mood scores (don't assume positivity if moods are low)
- Notice patterns: what activities or moments consistently appear? What brings them joy?

OUTPUT FORMAT:
Write exactly 2-3 warm sentences that:
1. Describe what's happening in their life based on ACTUAL patterns you see
2. Acknowledge their emotional state accurately (don't sugarcoat if moods are low, but be compassionate)
3. Highlight specific recurring themes from their entries
4. End with an uplifting observation about their journey

TONE: Warm, genuine, and specific to THEIR life. Avoid generic phrases. No advice, no diagnosis, no judgment.`;

    const moodContext = avgMood 
      ? `\n\nMood Statistics:\n- Average mood: ${avgMood}/5\n- Trend: ${moodTrend}\n- Total entries tracked: ${moodEntries.length}`
      : '\n\nNote: User has not tracked moods yet, focus on entry content themes.';

    console.log('Generating life insight for', entries.length, 'entries. Avg mood:', avgMood, 'Trend:', moodTrend);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: `Analyze these recent journal entries and provide a deeply accurate, personalized reflection:\n\n${entriesSummary}${moodContext}\n\nProvide your warm, insightful reflection (2-3 sentences only):`
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI service unavailable. Please try again later.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI gateway returned ${response.status}`);
    }

    const data = await response.json();
    const insight = data.choices[0].message.content.trim();

    console.log('Generated life insight successfully');

    return new Response(
      JSON.stringify({ insight }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in generate-life-insight function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to generate insight' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
