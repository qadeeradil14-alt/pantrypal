import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import {
  ALREADY_IN_HOUSEHOLD_MESSAGE,
  avatarColor,
  initials,
  joinHouseholdErrorMessage,
  normalizeInviteCode,
  type SyncStatus,
} from '../core/services/household';
import type { HouseholdIdentity, HouseholdMember } from '../types';
import { createAvatarSignedUrl } from '../core/services/profileAvatar';
import { setSyncDiagIdentity } from '../core/services/syncDiag'; // DIAG: temporary — remove after OTA 389/390 investigation
import { withTimeout } from '../core/services/withTimeout';

const STORAGE_KEY = 'stokit:v2:household';
// Matches PULL_TIMEOUT_MS in syncEngine.ts. This RPC gates app-boot hydration
// (durableStore.hydrate -> startSyncEngine -> householdId -> ensureHousehold),
// so an unbounded call here can hang the splash screen forever on weak networks.
const RPC_TIMEOUT_MS = 10_000;
let householdChannel: ReturnType<typeof supabase.channel> | null = null;
let subscribedHouseholdId: string | null = null;
let profileChannel: ReturnType<typeof supabase.channel> | null = null;
let subscribedProfileHouseholdId: string | null = null;

type Result =
  | { ok: true; message?: string; alreadyMember?: boolean }
  | { ok: false; message: string; invalidCode?: boolean };
type HouseholdPayload = HouseholdIdentity & {
  members: Array<Pick<HouseholdMember, 'id' | 'displayName' | 'avatarPath' | 'role' | 'joinedAt'>>;
};

interface HouseholdState {
  household: HouseholdIdentity | null;
  members: HouseholdMember[];
  /** True when at least one non-me household member has a push token registered. */
  partnerHasToken: boolean;
  syncStatus: SyncStatus;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  refresh: () => Promise<Result>;
  ensureHousehold: () => Promise<Result>;
  clearLocal: () => Promise<void>;
  createHousehold: (name: string, myName: string) => Promise<Result>;
  joinHousehold: (rawCode: string, myName: string) => Promise<Result>;
  leaveHousehold: () => Promise<Result>;
  removeMember: (targetUserId: string) => Promise<Result>;
  transferOwnership: (targetUserId: string) => Promise<Result>;
  deleteHousehold: () => Promise<Result>;
  renameMe: (name: string) => Promise<Result>;
}

type PersistedShape = Pick<HouseholdState, 'household' | 'members'>;

function persist(state: PersistedShape) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
}

function message(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return 'Could not update household. Try again.';
}

async function applyPayload(payload: HouseholdPayload | null, set: (state: Partial<HouseholdState>) => void) {
  if (!payload) return;
  const { data: { user } } = await supabase.auth.getUser();
  const household: HouseholdIdentity = {
    id: payload.id,
    name: payload.name,
    inviteCode: payload.inviteCode,
    isPersonal: payload.isPersonal,
    role: payload.role,
    createdAt: Number(payload.createdAt),
  };
  const members = await Promise.all(payload.members.map(async (member) => ({
    ...member,
    avatarPath: member.avatarPath ?? null,
    avatarUrl: await createAvatarSignedUrl(member.avatarPath ?? null),
    joinedAt: Number(member.joinedAt),
    initials: initials(member.displayName),
    avatarColor: avatarColor(member.id),
    isMe: member.id === user?.id,
  })));

  let partnerHasToken = false;
  if (!payload.isPersonal) {
    const { data: tokenRows } = await supabase
      .from('household_members')
      .select('user_id, push_token')
      .eq('household_id', household.id);
    partnerHasToken = ((tokenRows ?? []) as Array<{ user_id: string; push_token: string | null }>)
      .filter((r) => r.user_id !== user?.id)
      .some((r) => r.push_token !== null);
  }

  set({ household, members, partnerHasToken, syncStatus: 'synced' });
  // DIAG: temporary — remove after OTA 389/390 investigation. Feeds household id
  // + this device's role to the sync diagnostics for attribution/gating only.
  setSyncDiagIdentity({
    householdId: household.id,
    role: members.find((m) => m.isMe)?.role ?? household.role ?? null,
  });
  persist({ household, members: members.map((member) => ({ ...member, avatarUrl: null })) });
  if (subscribedHouseholdId !== household.id) {
    if (householdChannel) void supabase.removeChannel(householdChannel);
    subscribedHouseholdId = household.id;
    householdChannel = supabase
      .channel(`household-members:${household.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'household_members',
        filter: `household_id=eq.${household.id}`,
      }, () => { void useHouseholdStore.getState().refresh(); })
      .subscribe();
  }
  if (subscribedProfileHouseholdId !== household.id) {
    if (profileChannel) void supabase.removeChannel(profileChannel);
    subscribedProfileHouseholdId = household.id;
    profileChannel = supabase
      .channel(`household-profiles:${household.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'profiles',
        filter: `household_id=eq.${household.id}`,
      }, () => { void useHouseholdStore.getState().refresh(); })
      .subscribe();
  }
}

async function rpc(name: string, args?: Record<string, string>): Promise<HouseholdPayload | null> {
  const { data, error } = await withTimeout(supabase.rpc(name, args), RPC_TIMEOUT_MS);
  if (error) throw error;
  return data as HouseholdPayload;
}

async function rpcRequired(name: string, args?: Record<string, string>): Promise<HouseholdPayload> {
  const payload = await rpc(name, args);
  if (!payload) throw new Error('Could not load household.');
  return payload;
}

async function reloadSharedState() {
  const { stopSyncEngine, pullFromSupabase, startSyncEngine } = await import('../core/services/syncEngine');
  const { useDurableStore } = await import('./durable-store');
  const { useSessionStore } = await import('./session-store');
  stopSyncEngine();
  await Promise.all([
    useDurableStore.getState().resetLocalOnly(),
    useSessionStore.getState().clearSession(),
  ]);
  await pullFromSupabase();
  await startSyncEngine();
}

export const useHouseholdStore = create<HouseholdState>((set, get) => ({
  household: null,
  members: [],
  partnerHasToken: false,
  syncStatus: 'local',
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) set(JSON.parse(raw) as PersistedShape);
    } catch {}
    set({ hydrated: true });
  },

  refresh: async () => {
    set({ syncStatus: 'syncing' });
    try {
      const prevId = get().household?.id;
      const payload = await rpc('my_household');
      if (payload) {
        await applyPayload(payload, set);
      } else {
        await applyPayload(await rpcRequired('ensure_personal_household', { p_display_name: 'Me' }), set);
      }
      const newId = get().household?.id;
      if (prevId && newId && prevId !== newId) {
        await reloadSharedState();
      }
      return { ok: true };
    } catch (error) {
      set({ syncStatus: 'error' });
      return { ok: false, message: message(error) };
    }
  },

  ensureHousehold: async () => {
    set({ syncStatus: 'syncing' });
    try {
      await applyPayload(await rpcRequired('ensure_personal_household', { p_display_name: 'Me' }), set);
      return { ok: true };
    } catch (error) {
      set({ syncStatus: 'error' });
      return { ok: false, message: message(error) };
    }
  },

  clearLocal: async () => {
    if (householdChannel) void supabase.removeChannel(householdChannel);
    if (profileChannel) void supabase.removeChannel(profileChannel);
    householdChannel = null;
    profileChannel = null;
    subscribedHouseholdId = null;
    subscribedProfileHouseholdId = null;
    await AsyncStorage.removeItem(STORAGE_KEY);
    set({ household: null, members: [], syncStatus: 'local', hydrated: true });
  },

  createHousehold: async (name, myName) => {
    set({ syncStatus: 'syncing' });
    try {
      await applyPayload(await rpcRequired('create_shared_household', {
        p_name: name.trim(),
        p_display_name: myName.trim() || 'Me',
      }), set);
      return { ok: true };
    } catch (error) {
      set({ syncStatus: 'error' });
      return { ok: false, message: message(error) };
    }
  },

  joinHousehold: async (rawCode, myName) => {
    const code = normalizeInviteCode(rawCode);
    if (!code) return { ok: false, invalidCode: true, message: 'Invalid invite code.' };
    set({ syncStatus: 'syncing' });
    try {
      const currentHouseholdId = get().household?.id;
      const payload = await rpcRequired('join_household_by_code', {
        p_invite_code: code,
        p_display_name: myName.trim() || 'Me',
      });
      const alreadyMember = Boolean(currentHouseholdId && payload.id === currentHouseholdId && !payload.isPersonal);
      await applyPayload(payload, set);
      if (alreadyMember) return { ok: true, alreadyMember: true, message: ALREADY_IN_HOUSEHOLD_MESSAGE };
      await reloadSharedState();

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { registerPushToken } = await import('../core/services/notifications');
        await registerPushToken(user.id);
      }

      return { ok: true };
    } catch (error) {
      set({ syncStatus: 'error' });
      const mapped = joinHouseholdErrorMessage(message(error));
      return { ok: false, invalidCode: mapped.invalidCode, message: mapped.message };
    }
  },

  leaveHousehold: async () => {
    set({ syncStatus: 'syncing' });
    try {
      await applyPayload(await rpcRequired('leave_shared_household'), set);
      await reloadSharedState();
      return { ok: true };
    } catch (error) {
      set({ syncStatus: 'error' });
      return { ok: false, message: message(error) };
    }
  },

  removeMember: async (targetUserId) => {
    set({ syncStatus: 'syncing' });
    try {
      await applyPayload(await rpcRequired('remove_household_member', { target_user_id: targetUserId }), set);
      return { ok: true };
    } catch (error) {
      set({ syncStatus: 'error' });
      return { ok: false, message: message(error) };
    }
  },

  transferOwnership: async (targetUserId) => {
    set({ syncStatus: 'syncing' });
    try {
      await applyPayload(await rpcRequired('transfer_household_ownership', { target_user_id: targetUserId }), set);
      return { ok: true };
    } catch (error) {
      set({ syncStatus: 'error' });
      return { ok: false, message: message(error) };
    }
  },

  deleteHousehold: async () => {
    set({ syncStatus: 'syncing' });
    try {
      await applyPayload(await rpcRequired('delete_shared_household'), set);
      await reloadSharedState();
      return { ok: true };
    } catch (error) {
      set({ syncStatus: 'error' });
      return { ok: false, message: message(error) };
    }
  },

  renameMe: async (name) => {
    const trimmed = name.trim() || 'Me';
    const { error } = await supabase.rpc('rename_me', { p_display_name: trimmed });
    if (error) return { ok: false, message: error.message };
    return get().refresh();
  },
}));
