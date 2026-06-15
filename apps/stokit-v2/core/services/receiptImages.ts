import { Directory, File, Paths } from 'expo-file-system';

export async function persistReceiptImage(uri: string): Promise<string> {
  const directory = new Directory(Paths.document, 'receipts');
  directory.create({ idempotent: true, intermediates: true });
  const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const destination = new File(directory, `receipt-${Date.now()}.${ext}`);
  await new File(uri).copy(destination);
  return destination.uri;
}
