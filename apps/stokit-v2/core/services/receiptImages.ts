import { Directory, File, Paths } from 'expo-file-system';

export async function persistReceiptImage(uri: string): Promise<string> {
  const directory = new Directory(Paths.document, 'receipts');
  directory.create({ idempotent: true, intermediates: true });
  const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const destination = new File(directory, `receipt-${Date.now()}.${ext}`);
  await new File(uri).copy(destination);
  return destination.uri;
}

/** Removes all locally stored receipt images (used on account deletion). */
export async function clearReceiptImages(): Promise<void> {
  const directory = new Directory(Paths.document, 'receipts');
  if (directory.exists) {
    directory.delete();
  }
}
