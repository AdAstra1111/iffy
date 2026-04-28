import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  
  try {
    const { text } = await req.json();
    if (!text || text.length < 100) {
      return new Response(JSON.stringify({ error: 'Text too short to classify' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const apiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'No API key' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a screenplay analyst. Classify documents from their content structure. Return ONLY valid JSON.' },
          { role: 'user', content: `DOCUMENT EXCERPT:\n${text.slice(0, 2000)}\n\nCLASSIFICATION:\n- doc_type: screenplay | treatment | concept_brief | beat_sheet | character_bible | story_outline | pitch_document | episode_grid | market_sheet | deck | other\n- confidence: high | medium | low\n- lane: feature_film | vertical_drama | ambiguous\n- reasoning: 1 sentence\n- key_signals: 3-5 structural signals\n\nRespond in JSON only.` },
        ],
        max_tokens: 500,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) throw new Error(`AI error: ${response.status}`);
    const data = await response.json();
    const content = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    
    return new Response(JSON.stringify(content), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
