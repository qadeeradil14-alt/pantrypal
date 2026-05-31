/**
 * identify-product Edge Function
 *
 * Called when all barcode database lookups fail.
 * The app sends a base64 photo of the product label;
 * GPT-4o Vision identifies the product name, brand, and category.
 *
 * POST body: { imageBase64: string, mimeType: string, barcode?: string }
 * Response:  { name: string, brand: string|null, category: string } | { error: string }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface IdentifyRequest {
  imageBase64: string;
  mimeType: string;    // 'image/jpeg' | 'image/png' | 'image/heic'
  barcode?: string;    // optional hint
}

Deno.serve(async (req) => {
  // Auth check
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return new Response('Unauthorized', { status: 401 });

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  );
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) return new Response('Unauthorized', { status: 401 });

  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), {
    status: 500, headers: { 'Content-Type': 'application/json' },
  });

  const { imageBase64, mimeType, barcode }: IdentifyRequest = await req.json();
  if (!imageBase64) return new Response(JSON.stringify({ error: 'imageBase64 required' }), {
    status: 400, headers: { 'Content-Type': 'application/json' },
  });

  const safeMime = mimeType?.startsWith('image/') ? mimeType : 'image/jpeg';
  const barcodeHint = barcode ? `\nThe barcode number scanned was: ${barcode}. Use this as an additional hint if you recognise it.` : '';

  const prompt = `You are a grocery and household product identification assistant.
Look at this product label or package photo and identify the product.${barcodeHint}

Return ONLY valid JSON with this exact structure:
{
  "name": "full product name (e.g. Heinz Tomato Ketchup 32oz)",
  "brand": "brand name or null",
  "category": "fridge | freezer | pantry"
}

Rules:
- name: be specific — include size/variant if visible (e.g. "Tide PODS Original 42 count")
- brand: just the brand name without the product (e.g. "Tide", "Heinz")
- category: fridge = requires refrigeration, freezer = frozen, pantry = shelf-stable
- If you genuinely cannot identify the product at all, return: {"name": null, "brand": null, "category": "pantry"}
- Never guess wildly — return null name if uncertain`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${safeMime};base64,${imageBase64}`, detail: 'low' } },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI ${response.status}: ${err.slice(0, 200)}`);
    }

    const ai = await response.json();
    const result = JSON.parse(ai.choices[0].message.content);

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[identify-product] error:', err?.message);
    return new Response(JSON.stringify({ error: err?.message ?? 'identification failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
