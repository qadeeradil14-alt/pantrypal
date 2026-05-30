import { supabase } from './supabase';

export interface Receipt {
  id: string;
  household_id: string;
  uploaded_by: string;
  store_name: string | null;
  transaction_date: string | null;
  total_amount: number | null;
  image_url: string | null;
  status: 'processing' | 'done' | 'failed';
  created_at: string;
  receipt_items?: ReceiptItem[];
}

export interface ReceiptItem {
  id: string;
  receipt_id: string;
  name: string;
  quantity: number;
  unit_price: number | null;
  total_price: number | null;
  matched_item_id: string | null;
  item_category?: string | null;
}

export async function deleteReceiptItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('receipt_items').delete().eq('id', itemId);
  if (error) throw error;
}

export async function addManualReceipt(
  householdId: string,
  userId: string,
  storeName: string,
  totalAmount: number,
  transactionDate: string,
): Promise<Receipt> {
  const { data, error } = await supabase
    .from('receipts')
    .insert({
      household_id: householdId,
      uploaded_by: userId,
      store_name: storeName,
      total_amount: totalAmount,
      transaction_date: transactionDate,
      status: 'done',
    })
    .select()
    .single();
  if (error) throw error;
  return data as Receipt;
}

export async function uploadReceipt(
  householdId: string,
  userId: string,
  uri: string,
  mimeType: string,
): Promise<Receipt> {
  const ext = mimeType === 'application/pdf' ? 'pdf' : 'jpg';
  const path = `${householdId}/${Date.now()}.${ext}`;

  // On React Native, `new File(uri)` from expo-file-system is NOT a web Blob
  // and Supabase storage rejects it. The correct approach is to fetch() the
  // local file:// URI — React Native's fetch handles file:// URIs natively
  // and returns a real Blob that Supabase can upload.
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Could not read image file (status ${response.status})`);
  const blob = await response.blob();

  // Some pickers return 'image/heic' but the data is JPEG after expo compression.
  // Always upload as the detected mime type; fall back to image/jpeg for unknowns.
  const contentType = (mimeType && mimeType !== 'image/heic') ? mimeType : 'image/jpeg';

  const { error: uploadError } = await supabase.storage
    .from('receipts')
    .upload(path, blob, { contentType, upsert: false });

  if (uploadError) throw uploadError;

  const { data: receipt, error: insertError } = await supabase
    .from('receipts')
    .insert({
      household_id: householdId,
      uploaded_by: userId,
      image_url: path,
      status: 'processing',
    })
    .select()
    .single();

  if (insertError) throw insertError;

  // Trigger Edge Function asynchronously — failure is non-fatal
  supabase.functions.invoke('parse-receipt', {
    body: { receiptId: receipt.id, imageUrl: path, householdId },
  }).catch(() => {});

  return receipt as Receipt;
}

export async function deleteReceipt(receiptId: string): Promise<void> {
  const { error } = await supabase.from('receipts').delete().eq('id', receiptId);
  if (error) throw error;
}

export async function fetchReceipts(householdId: string): Promise<Receipt[]> {
  const { data, error } = await supabase
    .from('receipts')
    .select('*, receipt_items(*)')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data as Receipt[];
}

export async function getSpendByStore(householdId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data, error } = await supabase
    .from('receipts')
    .select('store_name, total_amount')
    .eq('household_id', householdId)
    .eq('status', 'done')
    .gte('created_at', thirtyDaysAgo.toISOString());

  if (error) throw error;

  const byStore: Record<string, number> = {};
  for (const r of data ?? []) {
    const store = r.store_name ?? 'Unknown';
    byStore[store] = (byStore[store] ?? 0) + (r.total_amount ?? 0);
  }
  return Object.entries(byStore)
    .map(([store, total]) => ({ store, total }))
    .sort((a, b) => b.total - a.total);
}

export interface SpendSummary {
  weeklyTotal: number;
  monthlyTotal: number;
  byStore: { store: string; total: number }[];
}

export async function getSpendSummary(householdId: string): Promise<SpendSummary> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const { data, error } = await supabase
    .from('receipts')
    .select('store_name, total_amount, created_at')
    .eq('household_id', householdId)
    .eq('status', 'done')
    .gte('created_at', thirtyDaysAgo.toISOString());

  if (error) throw error;

  let weeklyTotal = 0;
  let monthlyTotal = 0;
  const byStore: Record<string, number> = {};

  for (const r of data ?? []) {
    const amount = r.total_amount ?? 0;
    monthlyTotal += amount;
    if (new Date(r.created_at).getTime() >= sevenDaysAgoMs) weeklyTotal += amount;
    const store = r.store_name ?? 'Unknown';
    byStore[store] = (byStore[store] ?? 0) + amount;
  }

  return {
    weeklyTotal,
    monthlyTotal,
    byStore: Object.entries(byStore)
      .map(([store, total]) => ({ store, total }))
      .sort((a, b) => b.total - a.total),
  };
}
