import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ParseRequest {
  receiptId: string;
  imageUrl: string;
  householdId: string;
}

interface ParsedReceipt {
  store_name: string | null;
  transaction_date: string | null;
  total_amount: number | null;
  items: Array<{
    name: string;
    quantity: number;
    unit_price: number | null;
    total_price: number | null;
  }>;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

Deno.serve(async (req) => {
  const { receiptId, imageUrl, householdId }: ParseRequest = await req.json();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Download the image from Supabase Storage
    const { data: imageData, error: downloadError } = await supabase.storage
      .from('receipts')
      .download(imageUrl);

    if (downloadError || !imageData) throw new Error('Failed to download image');

    const arrayBuffer = await imageData.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const mimeType = imageUrl.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';

    // Call OpenAI GPT-4o vision
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) throw new Error('OPENAI_API_KEY not set');

    const prompt = `Analyze this receipt image and extract the data as JSON. Return ONLY valid JSON with this exact structure:
{
  "store_name": "store name or null",
  "transaction_date": "YYYY-MM-DD or null",
  "total_amount": 0.00,
  "items": [
    { "name": "item name", "quantity": 1, "unit_price": 0.00, "total_price": 0.00 }
  ]
}
Be precise with prices. Include every line item on the receipt.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' } },
          ],
        }],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);

    const aiResult = await response.json();
    const parsed: ParsedReceipt = JSON.parse(aiResult.choices[0].message.content);

    const { data: receiptRow } = await supabase
      .from('receipts')
      .select('uploaded_by')
      .eq('id', receiptId)
      .single();

    // Update receipt record with extracted data
    await supabase.from('receipts').update({
      store_name: parsed.store_name,
      transaction_date: parsed.transaction_date,
      total_amount: parsed.total_amount,
      status: 'done',
    }).eq('id', receiptId);

    // Fetch household items for auto-matching
    const { data: householdItems } = await supabase
      .from('items')
      .select('id, name, category')
      .eq('household_id', householdId);

    const existingByName = new Map<string, { id: string; name: string; category: string }>();
    for (const item of householdItems ?? []) {
      existingByName.set(normalizeName(item.name), item);
    }

    // Upsert pantry assets from parsed receipt lines.
    const itemIdByReceiptLine = new Map<string, string>();
    for (const line of parsed.items) {
      const normalized = normalizeName(line.name);
      if (!normalized) continue;

      const existing = existingByName.get(normalized);
      if (existing) {
        itemIdByReceiptLine.set(line.name, existing.id);
        await supabase
          .from('items')
          .update({ macro_status: 'in_stock', is_low: false, marked_low_by: null, got_it_by: null })
          .eq('id', existing.id);
        continue;
      }

      const inserted = await supabase
        .from('items')
        .insert({
          household_id: householdId,
          name: line.name.trim(),
          category: 'pantry',
          macro_status: 'in_stock',
          is_low: false,
          added_by: receiptRow?.uploaded_by ?? null,
        })
        .select('id, name, category')
        .single();

      if (!inserted.error && inserted.data) {
        existingByName.set(normalized, inserted.data);
        itemIdByReceiptLine.set(line.name, inserted.data.id);
      }
    }

    // Insert receipt items with fuzzy matching
    const receiptItems = parsed.items.map((item) => {
      const nameLower = item.name.toLowerCase();
      const matchedByInsert = itemIdByReceiptLine.get(item.name);
      const matched = matchedByInsert
        ? { id: matchedByInsert }
        : householdItems?.find((hi) =>
            nameLower.includes(hi.name.toLowerCase()) ||
            hi.name.toLowerCase().includes(nameLower)
          );
      return {
        receipt_id: receiptId,
        name: item.name,
        quantity: item.quantity ?? 1,
        unit_price: item.unit_price,
        total_price: item.total_price,
        matched_item_id: matched?.id ?? null,
      };
    });

    if (receiptItems.length > 0) {
      await supabase.from('receipt_items').insert(receiptItems);
    }

    // Auto-restock: mark matched items as no longer low (covers fuzzy-only matches)
    const matchedIds = receiptItems
      .filter((i) => i.matched_item_id)
      .map((i) => i.matched_item_id);

    if (matchedIds.length > 0) {
      await supabase.from('items')
        .update({ is_low: false, marked_low_by: null, got_it_by: null })
        .in('id', matchedIds);
    }

    return new Response(JSON.stringify({ success: true, itemCount: receiptItems.length }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    await supabase.from('receipts').update({ status: 'failed' }).eq('id', receiptId);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
