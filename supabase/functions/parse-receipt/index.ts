import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ParseRequest {
  receiptId: string;
  imageUrl: string;
  householdId: string;
}

type ItemCategory = 'food' | 'household' | 'personal_care' | 'non_grocery';

// Categories that should auto-populate the pantry
const PANTRY_CATEGORIES: ItemCategory[] = ['food', 'household', 'personal_care'];

interface ParsedReceipt {
  store_name: string | null;
  transaction_date: string | null;
  total_amount: number | null;
  items: Array<{
    name: string;
    quantity: number;
    unit_price: number | null;
    total_price: number | null;
    item_category: ItemCategory;
  }>;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

Deno.serve(async (req) => {
  // ── Auth: verify caller's JWT and confirm they belong to the target household ──
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  );
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { receiptId, imageUrl, householdId }: ParseRequest = await req.json();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Verify the authenticated user is a member of the requested household
  const { data: membership } = await supabase
    .from('household_members')
    .select('user_id')
    .eq('household_id', householdId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) {
    return new Response('Forbidden: caller is not a member of this household', { status: 403 });
  }

  try {
    console.log('[parse-receipt] START receiptId=' + receiptId + ' imageUrl=' + imageUrl);

    // Download the image from Supabase Storage
    const { data: imageData, error: downloadError } = await supabase.storage
      .from('receipts')
      .download(imageUrl);

    if (downloadError || !imageData) throw new Error('Failed to download image: ' + (downloadError?.message ?? 'no data'));
    console.log('[parse-receipt] image downloaded, size=' + imageData.size);

    const arrayBuffer = await imageData.arrayBuffer();
    // btoa(String.fromCharCode(...largeUint8Array)) throws "Maximum call stack size exceeded"
    // for iPhone photos (1-3MB). Convert in 8KB chunks instead.
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);
    const mimeType = imageUrl.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';

    // Call OpenAI GPT-4o vision
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    console.log('[parse-receipt] openai key present=' + !!openaiKey + ' length=' + (openaiKey?.length ?? 0));
    if (!openaiKey) throw new Error('OPENAI_API_KEY not set');

    const prompt = `Analyze this receipt image and extract the data as JSON. Return ONLY valid JSON with this exact structure:
{
  "store_name": "store name or null",
  "transaction_date": "YYYY-MM-DD or null",
  "total_amount": 0.00,
  "items": [
    { "name": "item name", "quantity": 1, "unit_price": 0.00, "total_price": 0.00, "item_category": "food" }
  ]
}

DATE EXTRACTION — critical:
- Read the EXACT date printed on the receipt. Do NOT guess or infer.
- Common formats on receipts: MM/DD/YY, MM/DD/YYYY, MM-DD-YY, Month DD YYYY, DD/MM/YYYY.
- Convert whatever format you see to YYYY-MM-DD. Example: "05/27/26" → "2026-05-27", "May 27 2026" → "2026-05-27".
- If you see "5/27/26" that is May 27 2026 → "2026-05-27". Do NOT subtract one day.
- If no date is visible, return null.

For each item, set "item_category" to one of these values:
- "food" — groceries, produce, meat, dairy, snacks, beverages, frozen food, canned goods, bread, condiments
- "household" — cleaning supplies, paper towels, toilet paper, laundry detergent, dish soap, trash bags
- "personal_care" — shampoo, soap, toothpaste, deodorant, vitamins, medicine
- "non_grocery" — toys, clothing, electronics, tools, sporting goods, furniture, caps, balls, utensils, anything NOT food or household/personal consumable

Be precise with prices. Include every line item on the receipt.`;

    const openaiBody = JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' } },
        ],
      }],
      response_format: { type: 'json_object' },
    });

    // Retry up to 3 times with exponential backoff for 429 rate limit errors
    let response: Response | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: openaiBody,
      });
      console.log(`[parse-receipt] openai attempt=${attempt} status=${response.status}`);
      if (response.status !== 429) break;
      if (attempt < 3) {
        const retryAfter = parseInt(response.headers.get('retry-after') ?? '5', 10);
        const delay = Math.min((retryAfter || attempt * 3) * 1000, 15000);
        console.log(`[parse-receipt] rate limited, retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    if (!response!.ok) {
      const errBody = await response!.text();
      throw new Error(`OpenAI error ${response!.status}: ${errBody.slice(0, 200)}`);
    }

    const aiResult = await response!.json();
    const parsed: ParsedReceipt = JSON.parse(aiResult.choices[0].message.content);

    const { data: receiptRow } = await supabase
      .from('receipts')
      .select('uploaded_by, store_name, transaction_date')
      .eq('id', receiptId)
      .single();

    // Update receipt record with extracted data
    await supabase.from('receipts').update({
      store_name: parsed.store_name ?? receiptRow?.store_name ?? null,
      transaction_date: parsed.transaction_date ?? receiptRow?.transaction_date ?? null,
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

    // Upsert pantry assets from parsed receipt lines — skip non_grocery items.
    const itemIdByReceiptLine = new Map<string, string>();
    for (const line of parsed.items) {
      const normalized = normalizeName(line.name);
      if (!normalized) continue;

      const itemCat: ItemCategory = PANTRY_CATEGORIES.includes(line.item_category) ? line.item_category : 'non_grocery';

      // Non-grocery items (toys, clothing, electronics, etc.) go on the receipt
      // for spend tracking but do NOT get added to the pantry.
      if (itemCat === 'non_grocery') {
        console.log('[parse-receipt] skipping non_grocery item: ' + line.name);
        continue;
      }

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
    const errMsg = err?.message ?? String(err);
    console.error('[parse-receipt] FAILED receiptId=' + receiptId + ' error=' + errMsg);
    await supabase.from('receipts').update({ status: 'failed' }).eq('id', receiptId);
    return new Response(JSON.stringify({ error: errMsg, receiptId }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
