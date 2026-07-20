import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ArrivalRow {
  id: string;
  household_id: string;
  store_id: string;
  arrived_by: string | null;
  arrived_by_name?: string | null;
  arrived_at?: string | null;
}

Deno.serve(async (req) => {
  // Fail closed: if WEBHOOK_SECRET is not configured, refuse all requests.
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
  if (!webhookSecret) {
    return new Response('Server misconfigured: WEBHOOK_SECRET not set', { status: 500 });
  }
  const signature = req.headers.get('x-supabase-signature') ?? '';
  if (signature !== webhookSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const record: ArrivalRow = await req.json();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: store } = await supabase
    .from('stores')
    .select('name')
    .eq('id', record.store_id)
    .maybeSingle();

  const storeName = store?.name ?? 'the store';
  const actorName = record.arrived_by_name?.trim() || 'Someone';

  const { data: members } = await supabase
    .from('household_members')
    .select('user_id, push_token')
    .eq('household_id', record.household_id)
    .neq('user_id', record.arrived_by ?? '')
    .not('push_token', 'is', null);

  if (!members || members.length === 0) {
    return new Response('ok', { status: 200 });
  }

  // Dedupe by the underlying push token, not member row. Two different member
  // rows (e.g. stale rows from prior sign-ins/switched accounts on the same
  // physical device) can share one Expo token — sending per-row would give
  // that one device multiple copies, including a copy back to the arriving
  // user's own device if a different member row happens to share their token.
  const uniqueTokens = new Set(
    members
      .map((m: { push_token: string | null }) => m.push_token)
      .filter((token): token is string => Boolean(token)),
  );

  const messages = Array.from(uniqueTokens).map((token) => ({
    to: token,
    sound: 'default',
    title: `${actorName} is shopping`,
    body: `${actorName} arrived at ${storeName}. Open the list to add items.`,
    data: {
      type: 'partner_arrival',
      storeId: record.store_id,
      householdId: record.household_id,
      arrivalId: record.id,
      actorName,
      arrivedAt: record.arrived_at ?? null,
    },
  }));

  if (messages.length > 0) {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
  }

  return new Response('ok', { status: 200 });
});
