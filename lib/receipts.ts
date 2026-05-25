import * as FileSystem from 'expo-file-system';
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
}

export async function uploadReceipt(
  householdId: string,
  userId: string,
  uri: string,
  mimeType: string,
): Promise<Receipt> {
  const ext = mimeType === 'application/pdf' ? 'pdf' : 'jpg';
  const path = `${householdId}/${Date.now()}.${ext}`;

  // Hermes does not support `new Blob([ArrayBuffer])`. Read the file as
  // base64 via expo-file-system and decode to a Uint8Array instead —
  // the Supabase JS SDK accepts typed arrays directly.
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const { error: uploadError } = await supabase.storage
    .from('receipts')
    .upload(path, bytes, { contentType: mimeType, upsert: false });

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
