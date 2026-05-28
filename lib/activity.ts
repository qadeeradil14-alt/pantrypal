import { supabase } from './supabase';

export interface ActivityEvent {
  itemId: string;
  itemName: string;
  type: 'marked_low' | 'picked_up';
  actorId: string;
  isSelf: boolean;
  updatedAt: string;
}

export async function fetchRecentActivity(
  householdId: string,
  currentUserId: string,
  limit = 5,
): Promise<ActivityEvent[]> {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('items')
    .select('id, name, is_low, marked_low_by, got_it_by, updated_at')
    .eq('household_id', householdId)
    .gt('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error || !data) return [];

  const events: ActivityEvent[] = [];

  for (const item of data) {
    if (!item.is_low && item.got_it_by) {
      events.push({
        itemId: item.id,
        itemName: item.name,
        type: 'picked_up',
        actorId: item.got_it_by,
        isSelf: item.got_it_by === currentUserId,
        updatedAt: item.updated_at,
      });
    } else if (item.is_low && item.marked_low_by) {
      events.push({
        itemId: item.id,
        itemName: item.name,
        type: 'marked_low',
        actorId: item.marked_low_by,
        isSelf: item.marked_low_by === currentUserId,
        updatedAt: item.updated_at,
      });
    }
  }

  return events.slice(0, limit);
}

export function formatActivityTime(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
