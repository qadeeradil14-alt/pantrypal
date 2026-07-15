export function formatInstalledUpdate(updateId: string | null | undefined): string {
  return updateId ? `Update ${updateId.slice(0, 8)}` : 'Embedded update';
}
