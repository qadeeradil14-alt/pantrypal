import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const stamp = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
const emailA = `pp_smoke_a_${stamp}@example.com`;
const emailB = `pp_smoke_b_${stamp}@example.com`;
const password = 'PantryPal!234';

function makeClient() {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function signUpAndGetClient(email) {
  const client = makeClient();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw new Error(`signUp failed for ${email}: ${error.message}`);
  if (!data.session) {
    throw new Error(`No session returned for ${email}. Email confirmation may be enabled.`);
  }
  return client;
}

async function run() {
  console.log('Starting Supabase smoke test...');
  console.log(`User A: ${emailA}`);
  console.log(`User B: ${emailB}`);

  const clientA = await signUpAndGetClient(emailA);
  const clientB = await signUpAndGetClient(emailB);

  const code = `SMK${Math.floor(100000 + Math.random() * 900000)}`;
  const householdName = `Smoke Household ${stamp}`;

  const createRes = await clientA.rpc('create_household_with_owner', {
    p_name: householdName,
    p_invite_code: code,
  });
  if (createRes.error) throw new Error(`create_household_with_owner failed: ${createRes.error.message}`);
  const created = Array.isArray(createRes.data) ? createRes.data[0] : createRes.data;
  if (!created?.id || !created?.invite_code) throw new Error('create_household_with_owner returned unexpected payload');
  console.log(`Household created: ${created.id} (${created.invite_code})`);

  const joinRes = await clientB.rpc('join_household_by_code', { p_invite_code: created.invite_code });
  if (joinRes.error) throw new Error(`join_household_by_code failed: ${joinRes.error.message}`);
  const joined = Array.isArray(joinRes.data) ? joinRes.data[0] : joinRes.data;
  if (!joined?.id || joined.id !== created.id) throw new Error('Joined household does not match created household');
  console.log('Join by invite code works');

  const insertItem = await clientA
    .from('items')
    .insert({
      household_id: created.id,
      name: `Smoke Item ${stamp}`,
      category: 'pantry',
    })
    .select()
    .single();
  if (insertItem.error) throw new Error(`Insert item failed: ${insertItem.error.message}`);
  console.log(`Item inserted: ${insertItem.data.id}`);

  const readByB = await clientB
    .from('items')
    .select('id, name, is_low')
    .eq('id', insertItem.data.id)
    .single();
  if (readByB.error) throw new Error(`User B read item failed: ${readByB.error.message}`);
  console.log('Cross-member item read works');

  const updateByB = await clientB
    .from('items')
    .update({ is_low: true })
    .eq('id', insertItem.data.id)
    .select('id, is_low')
    .single();
  if (updateByB.error) throw new Error(`User B update item failed: ${updateByB.error.message}`);
  if (!updateByB.data.is_low) throw new Error('Item low-state update did not persist');
  console.log('Cross-member item update works');

  const insertStore = await clientA
    .from('stores')
    .insert({
      household_id: created.id,
      name: `Smoke Store ${stamp}`,
      address: '123 Test St',
      latitude: 40.0,
      longitude: -74.0,
    })
    .select('id, name')
    .single();
  if (insertStore.error) throw new Error(`Insert store failed: ${insertStore.error.message}`);

  const readStoreByB = await clientB
    .from('stores')
    .select('id, name')
    .eq('id', insertStore.data.id)
    .single();
  if (readStoreByB.error) throw new Error(`User B read store failed: ${readStoreByB.error.message}`);
  console.log('Cross-member store read works');

  // Validate store delete path used by UI remove action.
  const deleteStoreRes = await clientA.from('stores').delete().eq('id', insertStore.data.id);
  if (deleteStoreRes.error) throw new Error(`Store delete failed: ${deleteStoreRes.error.message}`);
  console.log('Store delete works');

  console.log('✅ Supabase smoke test passed');
}

run().catch((err) => {
  console.error(`❌ Supabase smoke test failed: ${err.message}`);
  process.exit(1);
});
