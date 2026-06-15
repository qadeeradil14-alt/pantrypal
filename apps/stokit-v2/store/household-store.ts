import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { avatarColor, initials, normalizeInviteCode, type SyncStatus } from '../core/services/household';
import type { HouseholdIdentity, HouseholdMember } from '../types';

const STORAGE_KEY = 'stokit:v2:household';
let householdChannel: ReturnType<typeof supabase.channel> | null = null;
let subscribedHouseholdId: string | null = null;

type Result = { ok: true } | { ok: false; message: string; invalidCode?: boolean };
type HouseholdPayload = HouseholdIdentity & {
  members: Array<Pick<HouseholdMember, 'id' | 'displayName' | 'role' | 'joinedAt'>>;
};

interface HouseholdState {
  household: HouseholdIdentity | null;
  members: HouseholdMember[];
  syncStatus: SyncStatus;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  refresh: () => Promise<Result>;
  ensureHousehold: () => Promise<Result>;
  clearLocal: () => Promise<void>;
  createHousehold: (name: string, myName: string) => Promise<Result>;
  joinHousehold: (rawCode: string, myName: string) => Promise<Result>;
  leaveHousehold: () => Promise<Result>;
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
  const members = payload.members.map((member) => ({
    ...member,
    joinedAt: Number(member.joinedAt),
    initials: initials(member.displayName),
    avatarColor: avatarColor(member.id),
    isMe: member.id === user?.id,
  }));
  set({ household, members, syncStatus: 'synced' });
  persist({ household, members });
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
}

async function rpc(name: string, args?: Record<string, string>): Promise<HouseholdPayload> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as HouseholdPayload;
}

async function reloadSharedState() {
  const { stopSyncEngine, pullFromSupabase, pushLocalState, startSyncEngine } = await import('../core/services/syncEngine');
  const { useDurableStore } = await import('./durable-store');
  stopSyncEngine();
  await useDurableStore.getState().resetLocalOnly();
  await pullFromSupabase();
  await pushLocalState(useDurableStore.getState());
  await startSyncEngine();
}

export const useHouseholdStore = create<HouseholdState>((set, get) => ({
  household: null,
  members: [],
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
      await applyPayload(await rpc('my_household'), set);
      return { ok: true };
    } catch (error) {
      set({ syncStatus: 'error' });
      return { ok: false, message: message(error) };
    }
  },

  ensureHousehold: async () => {
    set({ syncStatus: 'syncing' });
    try {
      await applyPayload(await rpc('ensure_personal_household', { p_display_name: 'Me' }), set);
      return { ok: true };
    } catch (error) {
      set({ syncStatus: 'error' });
      return { ok: false, message: message(error) };
    }
  },

  clearLocal: async () => {
    if (householdChannel) void supabase.removeChannel(householdChannel);
    householdChannel = null;
    subscribedHouseholdId = null;
    await AsyncStorage.removeItem(STORAGE_KEY);
    set({ household: null, members: [], syncStatus: 'local', hydrated: true });
  },

  createHousehold: async (name, myName) => {
    set({ syncStatus: 'syncing' });
    try {
      await applyPayload(await rpc('create_shared_household', {
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
      await applyPayload(await rpc('join_household_by_code', {
        p_invite_code: code,
        p_display_name: myName.trim() || 'Me',
      }), set);
      await reloadSharedState();
      return { ok: true };
    } catch (error) {
      set({ syncStatus: 'error' });
      return { ok: false, invalidCode: message(error).includes('Invalid invite code'), message: message(error) };
    }
  },

  leaveHousehold: async () => {
    set({ syncStatus: 'syncing' });
    try {
      await applyPayload(await rpc('leave_shared_household'), set);
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
