import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type HouseholdMeta = {
  is_personal?: boolean | null;
  name?: string | null;
} | null;

type SenderMemberRow = {
  household_id: string;
  display_name: string | null;
  push_token: string | null;
  households?: HouseholdMeta | HouseholdMeta[];
};

type SenderCandidate = SenderMemberRow & {
  isPersonal: boolean | null;
  householdName: string | null;
  recipientCount: number;
  recipientTokenCount: number;
};

function householdMeta(row: SenderMemberRow): HouseholdMeta {
  const meta = row.households;
  return Array.isArray(meta) ? (meta[0] ?? null) : (meta ?? null);
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

  const profileHouseholdId = (profileRow as { household_id?: string | null } | null)?.household_id ?? null;
  const { data: senderRows, error: senderRowsError } = await serviceSupabase
    .from('household_members')
    .select('household_id, display_name, push_token, households(is_personal, name)')
    .eq('user_id', user.id);
  if (senderRowsError) {
    console.error('notify-shopping sender memberships lookup failed', { userId: user.id, error: senderRowsError.message });
    return json({ error: 'sender_lookup_failed', message: senderRowsError.message }, 500);
  }

  let senderRow: SenderMemberRow | null = null;
  let senderResolution = 'none';
  const memberRows = (senderRows ?? []) as SenderMemberRow[];
  const profileMatch = profileHouseholdId
    ? memberRows.find((row) => row.household_id === profileHouseholdId) ?? null
    : null;

  if (profileMatch) {
    senderRow = profileMatch;
    senderResolution = 'profile_household';
  } else {
    const candidates: SenderCandidate[] = [];
    for (const row of memberRows) {
      const meta = householdMeta(row);
      const { data: householdMembers } = await serviceSupabase
        .from('household_members')
        .select('user_id')
        .eq('household_id', row.household_id)
        .neq('user_id', user.id);
      const recipientUserIds = (householdMembers ?? []).map((m: { user_id: string }) => m.user_id);
      let recipientTokenCount = 0;
      if (recipientUserIds.length > 0) {
        const { data: tokenRows } = await serviceSupabase
          .from('household_members')
          .select('user_id, push_token')
          .in('user_id', recipientUserIds)
          .not('push_token', 'is', null);
        recipientTokenCount = new Set(
          ((tokenRows ?? []) as Array<{ user_id: string; push_token: string | null }>)
            .filter((tokenRow) => tokenRow.push_token)
            .map((tokenRow) => tokenRow.user_id),
        ).size;
      }
      candidates.push({
        ...row,
        isPersonal: typeof meta?.is_personal === 'boolean' ? meta.is_personal : null,
        householdName: meta?.name ?? null,
        recipientCount: recipientUserIds.length,
        recipientTokenCount,
      });
    }

    const sharedCandidates = candidates.filter((row) => row.isPersonal === false);
    const candidatePool = sharedCandidates.length > 0 ? sharedCandidates : candidates;
    const tokenReadyCandidates = candidatePool.filter((row) => row.recipientTokenCount > 0);
    const memberReadyCandidates = candidatePool.filter((row) => row.recipientCount > 0);
    const chosen =
      candidatePool.length === 1 ? candidatePool[0]
        : tokenReadyCandidates.length === 1 ? tokenReadyCandidates[0]
          : memberReadyCandidates.length === 1 ? memberReadyCandidates[0]
            : null;

    if (chosen) {
      senderRow = chosen;
      senderResolution = profileHouseholdId ? 'fallback_membership_profile_stale' : 'fallback_membership_no_profile';
    } else if (candidatePool.length > 1) {
      console.warn('notify-shopping ambiguous sender household', {
        userId: user.id,
        profileHouseholdId,
        candidates: candidatePool.map((row) => ({
          householdId: row.household_id,
          isPersonal: row.isPersonal,
          recipientCount: row.recipientCount,
          recipientTokenCount: row.recipientTokenCount,
        })),
      });
      return json({
        error: 'ambiguous_sender_household',
        message: 'Sender has multiple valid household memberships and no safe active household could be chosen',
        sent: 0,
        profileHouseholdId,
        candidates: candidatePool.map((row) => ({
          householdId: row.household_id,
          householdName: row.householdName,
          isPersonal: row.isPersonal,
          recipientCount: row.recipientCount,
          recipientTokenCount: row.recipientTokenCount,
        })),
      }, 409);
    }
  }
  console.log('notify-shopping sender household resolved', {
    userId: user.id,
    profileHouseholdId,
    senderHouseholdId: senderRow?.household_id ?? null,
    resolution: senderResolution,
  });

  // ── Diagnostic mode ─────────────────────────────────────────────────────────
  // Returns push-readiness counts for QA/devMode without sending anything.
  // Counts only — never the actual tokens.
  if (diagnostic) {
    if (!senderRow?.household_id) {
      return json({ diagnostic: true, memberCount: 0, recipientsWithToken: 0, senderHasToken: false });
    }
    // Get all member user_ids in this household (excluding sender)
    const { data: sharedMembers } = await serviceSupabase
      .from('household_members')
      .select('user_id')
      .eq('household_id', senderRow.household_id)
      .neq('user_id', user.id);
    const memberCount = (sharedMembers?.length ?? 0) + 1; // include sender in count
    const recipientUserIds = (sharedMembers ?? []).map((m: { user_id: string }) => m.user_id);
    let recipientsWithToken = 0;
    if (recipientUserIds.length > 0) {
      // Look for tokens across ALL household_members rows for each recipient.
      const { data: tokenRows } = await serviceSupabase
        .from('household_members')
        .select('user_id, push_token')
        .in('user_id', recipientUserIds)
        .not('push_token', 'is', null);
      const seen = new Set<string>();
      for (const r of (tokenRows ?? []) as Array<{ user_id: string; push_token: string | null }>) {
        if (r.push_token && !seen.has(r.user_id)) {
          seen.add(r.user_id);
          recipientsWithToken++;
        }
      }
    }
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

  // ── Recipient token resolution ───────────────────────────────────────────────
  // Step 1: get all OTHER member user_ids in this shared household.
  const { data: sharedMembers } = await serviceSupabase
    .from('household_members')
    .select('user_id')
    .eq('household_id', senderRow.household_id)
    .neq('user_id', user.id);

  const recipientUserIds = (sharedMembers ?? []).map((m: { user_id: string }) => m.user_id);

  const { count: excludedSenderCount } = await serviceSupabase
    .from('household_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('household_id', senderRow.household_id)
    .eq('user_id', user.id);

  if (recipientUserIds.length === 0) {
    console.warn('notify-shopping no recipients in household', { userId: user.id, householdId: senderRow.household_id });
    return json({ error: 'no_recipients', message: 'No other members in this household', sent: 0, excludedSenderCount, duplicateOrInvalidTokenCount: 0 }, 409);
  }

  // Step 2: find the best available push token for each recipient across ALL
  // their household_members rows. Expo push tokens are device-scoped — they work
  // regardless of which household_members row the token was stored in. Before
  // OTA 246 (broadcast token write), tokens were often stored only in a user's
  // personal household row, making them invisible to a shared-household-only query.
  const { data: tokenRows } = await serviceSupabase
    .from('household_members')
    .select('user_id, push_token')
    .in('user_id', recipientUserIds)
    .not('push_token', 'is', null);

  // Deduplicate by the underlying push token, not user_id. Two different
  // member rows (e.g. stale rows from prior sign-ins/switched accounts on the
  // same physical device) can share one Expo token — deduping by user_id alone
  // would still send that device two (or more) copies, including a copy back
  // to the sender's own device if a different user_id happens to share it.
  const uniqueTokens = new Set<string>();
  for (const row of (tokenRows ?? []) as Array<{ user_id: string; push_token: string | null }>) {
    if (row.push_token) uniqueTokens.add(row.push_token);
  }
  const tokenRowCount = (tokenRows ?? []).length;
  const duplicateOrInvalidTokenCount = (recipientUserIds.length - tokenRowCount) + (tokenRowCount - uniqueTokens.size);

  if (uniqueTokens.size === 0) {
    console.warn('notify-shopping no recipient tokens found', {
      userId: user.id,
      householdId: senderRow.household_id,
      recipientCount: recipientUserIds.length,
    });
    return json({ error: 'no_recipients', message: 'No household recipients with push tokens found', sent: 0, excludedSenderCount, duplicateOrInvalidTokenCount }, 409);
  }

  const messages = Array.from(uniqueTokens).map((token) => ({
    to: token,
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
      excludedSenderCount,
      duplicateOrInvalidTokenCount,
    });
    if (!expoResponse.ok) {
      return json({ error: 'expo_push_failed', message: expoText, sent: 0, excludedSenderCount, duplicateOrInvalidTokenCount }, 502);
    }
    const rejected = (expoJson?.data ?? []).filter((ticket) => ticket.status === 'error');
    if (rejected.length > 0) {
      return json({ error: 'expo_push_rejected', message: 'Expo rejected one or more push tickets', rejected, sent: 0, excludedSenderCount, duplicateOrInvalidTokenCount }, 502);
    }
  }

  return json({ sent: messages.length, excludedSenderCount, duplicateOrInvalidTokenCount });
});
