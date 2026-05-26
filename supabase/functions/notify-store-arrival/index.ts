import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ArrivalRow {
  id: string;
  household_id: string;
  store_id: string;
  arrived_by: string | null;
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

  const { data: members } = await supabase
    .from('household_members')
    .select('user_id, push_token')
    .eq('household_id', record.household_id)
    .neq('user_id', record.arrived_by ?? '')
    .not('push_token', 'is', null);

  if (!members || members.length === 0) {
    return new Response('ok', { status: 200 });
  }

  const messages = members
    .filter((m: { push_token: string | null }) => m.push_token)
    .map((m: { push_token: string }) => ({
      to: m.push_token,
      sound: 'default',
      title: 'Shopping trip started',
      body: `Someone arrived at ${storeName}. Open the list to add items.`,
      data: {
        storeId: record.store_id,
        householdId: record.household_id,
        arrivalId: record.id,
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
