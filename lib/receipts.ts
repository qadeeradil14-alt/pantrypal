import * as FileSystem from 'expo-file-system/legacy';
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
  storeName?: string | null,
  transactionDate?: string | null,
): Promise<Receipt> {
  const ext = mimeType === 'application/pdf' ? 'pdf' : 'jpg';
  const path = `${householdId}/${Date.now()}.${ext}`;
  const contentType = (mimeType && mimeType !== 'image/heic') ? mimeType : 'image/jpeg';

  // Hermes does NOT support Blob(ArrayBuffer) — supabase.storage.upload() hits
  // that wall internally even after the data-URI workaround.
  // Fix: bypass the Supabase JS SDK entirely and use FileSystem.uploadAsync(),
  // which delegates the HTTP transfer to the native layer (no JS Blob needed).
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/receipts/${path}`;

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

  const uploadResult = await FileSystem.uploadAsync(uploadUrl, uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': contentType,
      'x-upsert': 'false',
    },
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`Upload failed (${uploadResult.status}): ${uploadResult.body?.slice(0, 300) ?? 'no response body'}`);
  }

  const { data: receipt, error: insertError } = await supabase
    .from('receipts')
    .insert({
      household_id: householdId,
      uploaded_by: userId,
      store_name: storeName ?? null,
      transaction_date: transactionDate ?? null,
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
