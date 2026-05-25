import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ItemRow {
  id: string;
  household_id: string;
  name: string;
  is_low: boolean;
  marked_low_by: string | null;
}

Deno.serve(async (req) => {
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
  if (webhookSecret) {
    const signature = req.headers.get('x-supabase-signature');
    if (signature !== webhookSecret) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const record: ItemRow = await req.json();

  if (!record.is_low) {
    return new Response('ok', { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: members } = await supabase
    .from('household_members')
    .select('user_id, push_token')
    .eq('household_id', record.household_id)
    .neq('user_id', record.marked_low_by ?? '')
    .not('push_token', 'is', null);

  if (!members || members.length === 0) {
    return new Response('ok', { status: 200 });
  }

  const messages = members
    .filter((m: any) => m.push_token)
    .map((m: any) => ({
      to: m.push_token,
      sound: 'default',
      title: 'Running low',
      body: `${record.name} is running low — add it to the list?`,
      data: { itemId: record.id, householdId: record.household_id },
    }));

  if (messages.length > 0) {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
  }

  return new Response('ok', { status: 200 });
});
