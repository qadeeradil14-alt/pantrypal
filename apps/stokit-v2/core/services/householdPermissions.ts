import type { HouseholdIdentity } from '../../types';

export type HouseholdCapabilities = {
  canInvite: boolean;
  canRemoveMembers: boolean;
  canTransferOwnership: boolean;
  canLeave: boolean;
  canDeleteHousehold: boolean;
};

export function householdCapabilities(
  role: HouseholdIdentity['role'],
  memberCount: number,
): HouseholdCapabilities {
  const isOwner = role === 'owner';
  return {
    canInvite: isOwner,
    canRemoveMembers: isOwner && memberCount > 1,
    canTransferOwnership: isOwner && memberCount > 1,
    canLeave: !isOwner,
    canDeleteHousehold: isOwner && memberCount === 1,
  };
}
