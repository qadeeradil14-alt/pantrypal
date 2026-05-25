import { supabase } from './supabase';
import { ensureDefaultItems } from './items';

function generateInviteCode(): string {
  // Unambiguous character set (no 0/O, 1/I/L confusion)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback for environments without Web Crypto (should not happen in RN/Expo)
    for (let i = 0; i < 6; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

type HouseholdCore = {
  id: string;
  name: string;
  invite_code?: string;
};

function isMissingRpc(error: any): boolean {
  // PostgreSQL error code 42883 = undefined_function (RPC not deployed yet)
  return error?.code === '42883';
}

function normalizeRpcRow(data: unknown): HouseholdCore | null {
  if (!data) return null;
  if (Array.isArray(data)) return (data[0] as HouseholdCore) ?? null;
  return data as HouseholdCore;
}

export async function createHousehold(name: string, userId: string) {
  const fallbackCreate = async (inviteCode: string): Promise<HouseholdCore> => {
    const { data: created, error: householdError } = await supabase
      .from('households')
      .insert({ name, invite_code: inviteCode })
      .select('id, name, invite_code')
      .single();
    if (householdError) throw householdError;

    const { error: memberError } = await supabase
      .from('household_members')
      .insert({ household_id: created.id, user_id: userId, role: 'owner' });
    if (memberError) throw memberError;

    return created as HouseholdCore;
  };

  let household: HouseholdCore | null = null;
  let lastError: any = null;
  let rpcUnavailable = false;

  // Retry a few times if invite code collides.
  for (let i = 0; i < 3; i += 1) {
    const inviteCode = generateInviteCode();
    const { data, error } = await supabase.rpc('create_household_with_owner', {
      p_name: name,
      p_invite_code: inviteCode,
    });

    if (!error) {
      household = normalizeRpcRow(data);
      if (household) break;
    }

    if (isMissingRpc(error)) {
      rpcUnavailable = true;
      try {
        household = await fallbackCreate(inviteCode);
        break;
      } catch (fallbackError: any) {
        lastError = fallbackError;
        break;
      }
    }

    lastError = error;
    if (error?.code !== '23505') break;
  }

  if (!household) {
    if (rpcUnavailable) {
      throw new Error(
        'Could not create household. Apply DB migration 005_household_rpc.sql (or update RLS create policies) and try again.',
      );
    }
    throw lastError ?? new Error('Could not create household.');
  }
  if (!household.invite_code) {
    throw new Error('Household created without an invite code. Please try again.');
  }

  // Seed standard grocery defaults for a brand-new household.
  await ensureDefaultItems(household.id, userId);

  return {
    id: household.id,
    name: household.name,
    invite_code: household.invite_code,
  };
}

export async function joinHousehold(inviteCode: string, userId: string) {
  const { data, error } = await supabase.rpc('join_household_by_code', {
    p_invite_code: inviteCode.toUpperCase(),
  });

  if (error && !isMissingRpc(error)) {
    if ((error.message ?? '').toLowerCase().includes('invalid invite code')) {
      throw new Error('Invalid invite code. Check the code and try again.');
    }
    throw error;
  }

  const rpcHousehold = normalizeRpcRow(data);
  if (rpcHousehold) return rpcHousehold;

  // Fallback path if RPC is unavailable.
  const { data: household, error: findError } = await supabase
    .from('households')
    .select('id, name')
    .eq('invite_code', inviteCode.toUpperCase())
    .single();

  if (findError || !household) {
    throw new Error('Invalid invite code. Check the code and try again.');
  }

  const { error: joinError } = await supabase
    .from('household_members')
    .insert({ household_id: household.id, user_id: userId, role: 'member' });

  if (joinError && joinError.code !== '23505') throw joinError;
  return household;
}

export async function getMyHousehold(userId: string) {
  const { data, error } = await supabase
    .from('household_members')
    .select('household_id, role, households(id, name, invite_code)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data;
}
