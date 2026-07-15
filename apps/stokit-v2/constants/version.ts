export const OTA_SEQ = 312;
export const CURRENT_OTA_LABEL = `OTA ${OTA_SEQ}`;

export function formatInstalledUpdate(updateId: string | null | undefined): string {
  return updateId ?? 'Embedded update';
}
