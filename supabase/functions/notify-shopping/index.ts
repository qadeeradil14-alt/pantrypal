import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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

  let body: { storeName?: string; storeId?: string; diagnostic?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response('Bad request: invalid JSON', { status: 400 });
  }

  const { storeName, storeId, diagnostic } = body;

  const { data: profileRow, error: profileError } = await serviceSupabase
    .from('profiles')
    .select('household_id')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('notify-shopping profile lookup failed', { userId: user.id, error: profileError.message });
    return json({ error: 'profile_lookup_failed', message: profileError.message }, 500);
  }

  const activeHouseholdId = (profileRow as { household_id?: string | null } | null)?.household_id ?? null;
  const { data: senderRow, error: senderError } = activeHouseholdId
    ? await serviceSupabase
      .from('household_members')
      .select('household_id, display_name, push_token')
      .eq('household_id', activeHouseholdId)
      .eq('user_id', user.id)
      .maybeSingle()
    : { data: null, error: null };
  if (senderError) {
    console.error('notify-shopping sender lookup failed', { userId: user.id, activeHouseholdId, error: senderError.message });
    return json({ error: 'sender_lookup_failed', message: senderError.message }, 500);
  }

  // ── Diagnostic mode ─────────────────────────────────────────────────────────
  // Returns push-readiness counts for QA/devMode without sending anything.
  // Counts only — never the actual tokens.
  if (diagnostic) {
    if (!senderRow?.household_id) {
      return json({ diagnostic: true, memberCount: 0, recipientsWithToken: 0, senderHasToken: false });
    }
    const { data: allMembers } = await serviceSupabase
      .from('household_members')
      .select('user_id, push_token')
      .eq('household_id', senderRow.household_id);
    const memberCount = allMembers?.length ?? 0;
    const recipientsWithToken = (allMembers ?? []).filter(
      (m: { user_id: string; push_token: string | null }) => m.user_id !== user.id && m.push_token,
    ).length;
    return json({
      diagnostic: true,
      memberCount,
      recipientsWithToken,
      senderHasToken: Boolean(senderRow.push_token),
    });
  }

  if (!storeName?.trim()) {
    return new Response('Bad request: storeName required', { status: 400 });
  }

  if (!senderRow?.household_id) {
    return json({ error: 'no_active_household', message: 'No active household found for sender', sent: 0 }, 409);
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
    console.warn('notify-shopping no recipients', { userId: user.id, householdId: senderRow.household_id });
    return json({ error: 'no_recipients', message: 'No household recipients with push tokens found', sent: 0 }, 409);
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
    const expoResponse = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    const expoText = await expoResponse.text();
    let expoJson: { data?: Array<{ status?: string; message?: string; details?: unknown }> } | null = null;
    try {
      expoJson = JSON.parse(expoText);
    } catch {
      expoJson = null;
    }
    console.log('notify-shopping expo response', {
      status: expoResponse.status,
      body: expoJson ?? expoText,
    });
    if (!expoResponse.ok) {
      return json({ error: 'expo_push_failed', message: expoText, sent: 0 }, 502);
    }
    const rejected = (expoJson?.data ?? []).filter((ticket) => ticket.status === 'error');
    if (rejected.length > 0) {
      return json({ error: 'expo_push_rejected', message: 'Expo rejected one or more push tickets', rejected, sent: 0 }, 502);
    }
  }

  return json({ sent: messages.length });
});
