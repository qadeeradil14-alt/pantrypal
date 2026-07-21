import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ItemRow {
  id: string;
  household_id: string;
  name: string;
  is_low: boolean;
  marked_low_by: string | null;
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

  const record: ItemRow = await req.json();

  if (!record.is_low) {
    return new Response('ok', { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const senderId = record.marked_low_by ?? '';

  const { count: excludedSenderCount } = await supabase
    .from('household_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('household_id', record.household_id)
    .eq('user_id', senderId);

  const { data: members } = await supabase
    .from('household_members')
    .select('user_id, push_token')
    .eq('household_id', record.household_id)
    .neq('user_id', senderId)
    .not('push_token', 'is', null);

  const recipientRows = (members ?? []) as Array<{ user_id: string; push_token: string | null }>;

  if (recipientRows.length === 0) {
    console.log('notify-low-item no_recipients', { householdId: record.household_id, excludedSenderCount });
    return new Response('ok', { status: 200 });
  }

  // Dedupe by the underlying push token, not member row. Two different member
  // rows (e.g. stale rows from prior sign-ins/switched accounts on the same
  // physical device) can share one Expo token — sending per-row would give
  // that one device multiple copies, including a copy back to the marking
  // user's own device if a different member row happens to share their token.
  const uniqueTokens = new Set(
    recipientRows
      .map((m) => m.push_token)
      .filter((token): token is string => Boolean(token)),
  );
  const duplicateOrInvalidTokenCount = recipientRows.length - uniqueTokens.size;

  const messages = Array.from(uniqueTokens).map((token) => ({
    to: token,
    sound: 'default',
    title: 'Running low',
    body: `${record.name} is running low — add it to the list?`,
    data: { itemId: record.id, householdId: record.household_id },
  }));

  if (messages.length > 0) {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
  }

  console.log('notify-low-item sent', {
    householdId: record.household_id,
    sent: messages.length,
    excludedSenderCount,
    duplicateOrInvalidTokenCount,
  });

  return new Response('ok', { status: 200 });
});
