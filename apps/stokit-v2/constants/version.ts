export const OTA_SEQ = 314;
export const CURRENT_OTA_LABEL = `OTA ${OTA_SEQ}`;

export function formatAppVersion(version: string, buildNumber: string | null | undefined): string {
  return buildNumber ? `${version} (${buildNumber})` : version;
}

export function formatInstalledUpdate(updateId: string | null | undefined): string {
  return updateId ?? 'Embedded update';
}
