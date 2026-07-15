import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type HouseholdMeta = {
  id?: string | null;
  is_personal?: boolean | null;
  owner_id?: string | null;
} | null;

type MemberRow = {
  household_id: string;
  role: string | null;
  households?: HouseholdMeta | HouseholdMeta[];
};

function householdMeta(row: MemberRow): HouseholdMeta {
  const meta = row.households;
  return Array.isArray(meta) ? (meta[0] ?? null) : (meta ?? null);
}

async function removeHouseholdReceiptFiles(
  serviceSupabase: ReturnType<typeof createClient>,
  householdId: string,
): Promise<string | null> {
  const paths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await serviceSupabase.storage
      .from('receipts')
      .list(householdId, { limit: 100, offset });
    if (error) return error.message;

    const page = data ?? [];
    paths.push(...page.filter((entry) => entry.id).map((entry) => `${householdId}/${entry.name}`));
    if (page.length < 100) break;
    offset += page.length;
  }

  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await serviceSupabase.storage
      .from('receipts')
      .remove(paths.slice(index, index + 100));
    if (error) return error.message;
  }

  return null;
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

  // Verify the caller's JWT and extract their user_id. Deletion only ever
  // targets the authenticated caller — no user id is accepted from the body.
  const { data: { user }, error: authError } = await serviceSupabase.auth.getUser(
    authHeader.replace('Bearer ', ''),
  );
  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: memberRows, error: memberError } = await serviceSupabase
    .from('household_members')
    .select('household_id, role, households(id, is_personal, owner_id)')
    .eq('user_id', user.id);
  if (memberError) {
    console.error('delete-account membership lookup failed', {
      userId: user.id,
      error: memberError.message,
    });
    return json({ error: 'membership_lookup_failed' }, 500);
  }

  const rows = (memberRows ?? []) as MemberRow[];
  const ownedHouseholdIdsToDelete = new Set<string>();

  // Guard: an owner whose household still has other members must transfer
  // ownership or remove them first. `auth.admin.deleteUser` would otherwise
  // cascade-delete the shared household (and its snapshot) out from under
  // the remaining members via households.owner_id ON DELETE CASCADE.
  for (const row of rows) {
    const meta = householdMeta(row);
    const isOwner = row.role === 'owner' || meta?.owner_id === user.id;
    if (!isOwner) continue;

    const { count, error: countError } = await serviceSupabase
      .from('household_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('household_id', row.household_id);
    if (countError) {
      console.error('delete-account member count failed', {
        userId: user.id,
        householdId: row.household_id,
        error: countError.message,
      });
      return json({ error: 'membership_lookup_failed' }, 500);
    }
    if ((count ?? 0) > 1) {
      return json(
        {
          error: 'owner_has_members',
          message:
            'Transfer ownership or remove household members before deleting your account.',
        },
        409,
      );
    }
    ownedHouseholdIdsToDelete.add(row.household_id);
  }

  const avatarPath = `${user.id}/avatar.jpg`;
  const { error: avatarRemoveError } = await serviceSupabase.storage.from('avatars').remove([avatarPath]);
  if (avatarRemoveError) {
    console.error('delete-account avatar cleanup failed', {
      userId: user.id,
      error: avatarRemoveError.message,
    });
    return json({ error: 'storage_cleanup_failed' }, 500);
  }

  for (const householdId of ownedHouseholdIdsToDelete) {
    const cleanupError = await removeHouseholdReceiptFiles(serviceSupabase, householdId);
    if (cleanupError) {
      console.error('delete-account receipt cleanup failed', {
        userId: user.id,
        householdId,
        error: cleanupError,
      });
      return json({ error: 'storage_cleanup_failed' }, 500);
    }
  }

  // A non-owner member of a shared household leaves it first, via the
  // existing RPC running under the user's own JWT (it relies on auth.uid()).
  // This removes only their membership row and leaves the shared household
  // and snapshot untouched for the remaining members.
  const isSharedMember = rows.some((row) => {
    const meta = householdMeta(row);
    const isOwner = row.role === 'owner' || meta?.owner_id === user.id;
    return !isOwner && meta?.is_personal === false;
  });
  if (isSharedMember) {
    const userSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { error: leaveError } = await userSupabase.rpc('leave_shared_household');
    if (leaveError) {
      console.error('delete-account leave_shared_household failed', {
        userId: user.id,
        error: leaveError.message,
      });
      return json({ error: 'leave_household_failed' }, 500);
    }
  }

  // Remaining data (personal household, snapshot, profile, membership rows,
  // legacy pantry/receipt rows) is removed by ON DELETE CASCADE from auth.users.
  const { error: deleteError } = await serviceSupabase.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('delete-account admin delete failed', {
      userId: user.id,
      error: deleteError.message,
    });
    return json({ error: 'delete_failed' }, 500);
  }

  return json({ ok: true });
});
