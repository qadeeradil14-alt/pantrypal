const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { prompt, image, mimeType } = await req.json();

    if (!prompt || !image) {
      return new Response('Missing required fields: prompt and image are required.', {
        status: 400,
        headers: corsHeaders,
      });
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      console.error('[scan-receipt] OPENAI_API_KEY not configured');
      return new Response('OpenAI API key not configured', { status: 500, headers: corsHeaders });
    }

    const openaiBody = JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${image}`, detail: 'high' } },
        ],
      }],
      response_format: { type: 'json_object' },
    });

    let response: Response | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: openaiBody,
      });

      if (response.status !== 429) break;
      if (attempt < 3) {
        const retryAfter = parseInt(response.headers.get('retry-after') ?? '5', 10);
        const delay = Math.min((retryAfter || attempt * 3) * 1000, 15000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    if (!response || !response.ok) {
      const errBody = await response?.text();
      console.error(`[scan-receipt] OpenAI error ${response?.status}: ${errBody?.slice(0, 200)}`);
      return new Response(errBody, { status: response?.status || 500, headers: corsHeaders });
    }

    const aiResult = await response.json();
    const rawContent = aiResult.choices?.[0]?.message?.content ?? '';

    return new Response(rawContent, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    const errMsg = err?.message ?? String(err);
    console.error('[scan-receipt] Fatal error:', errMsg);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
