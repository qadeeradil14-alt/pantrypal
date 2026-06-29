import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Verify the caller's JWT and extract their user_id.
  const { data: { user }, error: authError } = await serviceSupabase.auth.getUser(
    authHeader.replace('Bearer ', ''),
  );
  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: { storeName?: string; storeId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Bad request: invalid JSON', { status: 400 });
  }

  const { storeName, storeId } = body;
  if (!storeName?.trim()) {
    return new Response('Bad request: storeName required', { status: 400 });
  }

  // Look up the sender's active household — prefer shared (is_personal=false) over personal.
  // Use limit(1) rather than maybeSingle() to avoid a 406 if the user somehow has
  // multiple rows (e.g. migration artefact); the ordering ensures the shared household wins.
  const { data: senderRows } = await serviceSupabase
    .from('household_members')
    .select('household_id, display_name')
    .eq('user_id', user.id)
    .order('is_personal', { ascending: true })
    .limit(1);
  const senderRow = senderRows?.[0] ?? null;

  if (!senderRow?.household_id) {
    // Caller is not in a household — nothing to notify.
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const senderName = senderRow.display_name?.trim() || 'Someone';

  // Fetch push tokens of every OTHER member in the same household.
  const { data: members } = await serviceSupabase
    .from('household_members')
    .select('push_token')
    .eq('household_id', senderRow.household_id)
    .neq('user_id', user.id)
    .not('push_token', 'is', null);

  if (!members || members.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const messages = members
    .filter((m: { push_token: string | null }) => m.push_token)
    .map((m: { push_token: string }) => ({
      to: m.push_token,
      sound: 'default',
      title: `Need anything from ${storeName}?`,
      body: `${senderName} says they're shopping at ${storeName}. Add anything you need now.`,
      data: { type: 'partner_arrival', storeName, ...(storeId ? { storeId } : {}) },
    }));

  if (messages.length > 0) {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
  }

  return new Response(JSON.stringify({ sent: messages.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
