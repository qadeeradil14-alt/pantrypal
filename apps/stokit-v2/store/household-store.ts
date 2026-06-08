/**
 * Stokit V2 — Household store.
 *
 * Persists household identity and member list to AsyncStorage.
 * Kept separate from durable-store so sync concerns don't bleed into
 * pantry / shopping state.
 *
 * Sync model:
 *   - V2 prototype: local-only. Data lives on this device.
 *   - Production: swap resolveInviteCode + syncCreateHousehold for Supabase calls.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { nanoid } from 'nanoid/non-secure';
import {
  generateInviteCode,
  normalizeInviteCode,
  initials,
  avatarColor,
  type SyncStatus,
} from '../core/services/household';
import type { HouseholdIdentity, HouseholdMember } from '../types';

const STORAGE_KEY = 'stokit:v2:household';

interface HouseholdState {
  household: HouseholdIdentity | null;
  members: HouseholdMember[];
  syncStatus: SyncStatus;
  hydrated: boolean;

  // ── Actions ──────────────────────────────────────────────────────────────
  hydrate: () => Promise<void>;
  clearLocal: () => Promise<void>;
  createHousehold: (name: string, myName: string) => void;
  joinHousehold: (rawCode: string, myName: string) => 'ok' | 'invalid_code' | 'error';
  leaveHousehold: () => void;
  updateHouseholdName: (name: string) => void;
  updateMyName: (name: string) => void;
  /** Called when another member joins (future: pushed from Supabase realtime). */
  addMember: (member: HouseholdMember) => void;
  removeMember: (memberId: string) => void;
}

type PersistedShape = {
  household: HouseholdIdentity | null;
  members: HouseholdMember[];
};

function persist(state: PersistedShape) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
}

export const useHouseholdStore = create<HouseholdState>((set, get) => ({
  household: null,
  members: [],
  syncStatus: 'local',
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as PersistedShape;
        set({ household: saved.household ?? null, members: saved.members ?? [] });
      }
    } catch {
      // First launch — no data yet
    }
    set({ hydrated: true });
  },

  clearLocal: async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    set({ household: null, members: [], syncStatus: 'local', hydrated: true });
  },

  createHousehold: (name, myName) => {
    const myId = nanoid();
    const household: HouseholdIdentity = {
      id: nanoid(),
      name: name.trim(),
      inviteCode: generateInviteCode(),
      role: 'owner',
      createdAt: Date.now(),
    };
    const me: HouseholdMember = {
      id: myId,
      displayName: myName.trim() || 'Me',
      initials: initials(myName.trim() || 'Me'),
      avatarColor: avatarColor(myId),
      role: 'owner',
      joinedAt: Date.now(),
      isMe: true,
    };
    set({ household, members: [me], syncStatus: 'local' });
    persist({ household, members: [me] });
  },

  joinHousehold: (rawCode, myName) => {
    const code = normalizeInviteCode(rawCode);
    if (!code) return 'invalid_code';

    // Local mode: create a household identity from the entered code.
    // In production, this would look up the code in Supabase first.
    const myId = nanoid();
    const household: HouseholdIdentity = {
      id: nanoid(),
      name: 'Shared household',   // Will be overwritten when Supabase is live
      inviteCode: code,
      role: 'member',
      createdAt: Date.now(),
    };
    const me: HouseholdMember = {
      id: myId,
      displayName: myName.trim() || 'Me',
      initials: initials(myName.trim() || 'Me'),
      avatarColor: avatarColor(myId),
      role: 'member',
      joinedAt: Date.now(),
      isMe: true,
    };
    set({ household, members: [me], syncStatus: 'local' });
    persist({ household, members: [me] });
    return 'ok';
  },

  leaveHousehold: () => {
    set({ household: null, members: [], syncStatus: 'local' });
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  },

  updateHouseholdName: (name) => {
    const { household, members } = get();
    if (!household) return;
    const updated = { ...household, name: name.trim() };
    set({ household: updated });
    persist({ household: updated, members });
  },

  updateMyName: (name) => {
    const { household, members } = get();
    const trimmed = name.trim() || 'Me';
    const updated = members.map((m) =>
      m.isMe
        ? { ...m, displayName: trimmed, initials: initials(trimmed) }
        : m,
    );
    set({ members: updated });
    persist({ household, members: updated });
  },

  addMember: (member) => {
    const { household, members } = get();
    if (members.some((m) => m.id === member.id)) return;
    const updated = [...members, member];
    set({ members: updated });
    persist({ household, members: updated });
  },

  removeMember: (memberId) => {
    const { household, members } = get();
    const updated = members.filter((m) => m.id !== memberId);
    set({ members: updated });
    persist({ household, members: updated });
  },
}));
