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
const emailC = `pp_smoke_c_${stamp}@example.com`;
const password = 'Stokit!234';

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
  console.log(`User C: ${emailC}`);

  const clientA = await signUpAndGetClient(emailA);
  const clientB = await signUpAndGetClient(emailB);
  const clientC = await signUpAndGetClient(emailC);

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

  const blockedJoin = await clientC.rpc('join_household_by_code', { p_invite_code: created.invite_code });
  if (!blockedJoin.error && !('plan' in created)) {
    throw new Error('Household limit migration is not applied: third member joined and household plan column is missing');
  }
  if (!blockedJoin.error || !blockedJoin.error.message.toLowerCase().includes('household member limit')) {
    throw new Error('Free household member limit did not block the third member');
  }
  console.log('Free household member limit blocks third member');

  const directJoinBypass = await clientC
    .from('household_members')
    .insert({ household_id: created.id, user_id: (await clientC.auth.getUser()).data.user.id, role: 'member' });
  if (!directJoinBypass.error) {
    throw new Error('Direct household_members insert bypass unexpectedly succeeded');
  }
  console.log('Direct household member insert bypass is blocked');

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

  // Trigger pipeline: low/out item should auto-appear in shopping_list.
  const activeShopping = await clientA
    .from('shopping_list')
    .select('id, name, status, source_item_id')
    .eq('household_id', created.id)
    .eq('status', 'active')
    .eq('source_item_id', insertItem.data.id)
    .single();
  if (activeShopping.error) {
    throw new Error(`shopping_list trigger insert failed: ${activeShopping.error.message}`);
  }
  console.log('Pantry-to-shopping trigger insert works');

  // Mark item back to stocked and verify shopping row is completed.
  const updateBackOk = await clientA
    .from('items')
    .update({ is_low: false })
    .eq('id', insertItem.data.id)
    .select('id, macro_status, is_low')
    .single();
  if (updateBackOk.error) throw new Error(`Update item back to stocked failed: ${updateBackOk.error.message}`);
  if (updateBackOk.data.is_low !== false || updateBackOk.data.macro_status !== 'in_stock') {
    throw new Error('macro_status/is_low sync failed while moving back to stocked');
  }
  const completedShopping = await clientA
    .from('shopping_list')
    .select('id, status, source_item_id')
    .eq('household_id', created.id)
    .eq('source_item_id', insertItem.data.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();
  if (completedShopping.error) {
    throw new Error(`shopping_list completion lookup failed: ${completedShopping.error.message}`);
  }
  if (completedShopping.data.status !== 'completed') {
    throw new Error('shopping_list row was not completed after item restock');
  }
  console.log('Pantry-to-shopping completion sync works');

  // Macro-status path should also re-open shopping row.
  const markOut = await clientA
    .from('items')
    .update({ macro_status: 'out_of_stock' })
    .eq('id', insertItem.data.id)
    .select('id, macro_status, is_low')
    .single();
  if (markOut.error) throw new Error(`macro_status update failed: ${markOut.error.message}`);
  if (markOut.data.is_low !== true || markOut.data.macro_status !== 'out_of_stock') {
    throw new Error('macro_status/is_low sync failed for out_of_stock');
  }
  const reopenedShopping = await clientB
    .from('shopping_list')
    .select('id, status')
    .eq('household_id', created.id)
    .eq('source_item_id', insertItem.data.id)
    .eq('status', 'active')
    .single();
  if (reopenedShopping.error) {
    throw new Error(`Cross-member shopping_list read failed: ${reopenedShopping.error.message}`);
  }
  console.log('Shopping list realtime ledger is shared across household members');

  // Profile household pointer should be synced for both users.
  const profileA = await clientA
    .from('profiles')
    .select('id, household_id')
    .eq('id', (await clientA.auth.getUser()).data.user.id)
    .single();
  if (profileA.error || profileA.data.household_id !== created.id) {
    throw new Error('Profile household sync failed for owner');
  }
  const profileB = await clientB
    .from('profiles')
    .select('id, household_id')
    .eq('id', (await clientB.auth.getUser()).data.user.id)
    .single();
  if (profileB.error || profileB.data.household_id !== created.id) {
    throw new Error('Profile household sync failed for member');
  }
  console.log('Profile household mapping sync works');

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

  const brands = await clientA
    .from('store_brands')
    .select('id, name, domain, logo_url')
    .ilike('search_text', '%whole%')
    .limit(3);
  if (brands.error) throw new Error(`Store brand search failed: ${brands.error.message}`);
  const wholeFoods = brands.data.find((b) => b.name === 'Whole Foods Market');
  if (!wholeFoods) throw new Error('Store brand search did not return Whole Foods Market');
  console.log('Store brand search works');

  const brandedStore = await clientA
    .from('stores')
    .insert({
      household_id: created.id,
      name: `Whole Foods Smoke ${stamp}`,
      address: '690 Stanyan Street, San Francisco, CA 94117',
      latitude: 37.7697,
      longitude: -122.4538,
      store_brand_id: wholeFoods.id,
      brand_domain: wholeFoods.domain,
      logo_url: wholeFoods.logo_url,
    })
    .select('id, name, store_brand_id, brand_domain, logo_url')
    .single();
  if (brandedStore.error) throw new Error(`Branded store insert failed: ${brandedStore.error.message}`);
  if (brandedStore.data.store_brand_id !== wholeFoods.id || brandedStore.data.brand_domain !== wholeFoods.domain) {
    throw new Error('Branded store fields did not persist');
  }
  console.log('Branded store insert works');

  const duplicateStore = await clientA
    .from('stores')
    .insert({
      household_id: created.id,
      name: `whole foods smoke ${stamp}`,
      address: '690 Stanyan Street, San Francisco, CA 94117',
    });
  if (!duplicateStore.error) throw new Error('Duplicate store insert unexpectedly succeeded');
  console.log('Duplicate store guard works');

  // Validate store delete path used by UI remove action.
  const deleteBrandedStoreRes = await clientA.from('stores').delete().eq('id', brandedStore.data.id);
  if (deleteBrandedStoreRes.error) throw new Error(`Branded store delete failed: ${deleteBrandedStoreRes.error.message}`);

  const deleteStoreRes = await clientA.from('stores').delete().eq('id', insertStore.data.id);
  if (deleteStoreRes.error) throw new Error(`Store delete failed: ${deleteStoreRes.error.message}`);
  console.log('Store delete works');

  console.log('✅ Supabase smoke test passed');
}

run().catch((err) => {
  console.error(`❌ Supabase smoke test failed: ${err.message}`);
  process.exit(1);
});
