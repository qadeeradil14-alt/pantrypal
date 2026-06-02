import { extractInviteCodeFromUrl } from '../lib/invites';

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  const code = extractInviteCodeFromUrl(path);
  if (code && path.toLowerCase().includes('join')) {
    return `/join?code=${encodeURIComponent(code)}`;
  }
  return path;
}
