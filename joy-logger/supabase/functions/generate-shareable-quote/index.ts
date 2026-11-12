import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateQuoteInput {
  entryText: string;
}

function validateInput(input: any): { valid: boolean; data?: GenerateQuoteInput; error?: string } {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'Invalid input: expected an object' };
  }

  const { entryText } = input;

  if (!entryText || typeof entryText !== 'string') {
    return { valid: false, error: 'Invalid input: entryText must be a non-empty string' };
  }

  if (entryText.trim().length === 0) {
    return { valid: false, error: 'Invalid input: entryText cannot be empty' };
  }

  if (entryText.length > 500) {
    return { valid: false, error: 'Invalid input: entryText must be less than 500 characters' };
  }

  return { valid: true, data: { entryText: entryText.trim() } };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse and validate input
    const body = await req.json();
    const validation = validateInput(body);
    
    if (!validation.valid) {
      console.error('Validation error:', validation.error);
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { entryText } = validation.data!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const systemPrompt = `You are a compassionate writer who transforms personal journal entries into beautiful, shareable quotes.

Your task: Read the user's journal entry and create ONE SHORT, UPLIFTING QUOTE (1-2 sentences max) that captures the essence of their good moment.

Guidelines:
- Keep it under 100 characters if possible
- Make it positive and inspiring
- Use "I" statements to keep it personal
- Make it shareable - something they'd be proud to post
- Don't add quotation marks
- Focus on the emotion and meaning, not just restating facts

Example transformations:
Entry: "Had a great coffee with my sister today, we laughed so much"
Quote: I found joy in the simple moments with someone I love

Entry: "Finally finished that project I've been working on for weeks"
Quote: I did the thing I thought I couldn't do

Now create a shareable quote from the following entry:`;

    console.log('Calling Lovable AI for quote generation...');
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: entryText }
        ],
        temperature: 0.8,
        max_tokens: 100,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'AI service rate limit reached. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI service payment required. Please contact support.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'AI service temporarily unavailable' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const quote = aiData.choices?.[0]?.message?.content?.trim();

    if (!quote) {
      console.error('No quote generated from AI response');
      return new Response(
        JSON.stringify({ error: 'Failed to generate quote' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Quote generated successfully');
    return new Response(
      JSON.stringify({ quote }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error in generate-shareable-quote:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
