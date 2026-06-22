import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { processAuthLink, withTimeout, type AuthLinkResult } from './auth-link-processing';

let lastUrl: string | null = null;
let lastResult: Promise<AuthLinkResult<Session>> | null = null;

export function handleAuthLink(url: string): Promise<AuthLinkResult<Session>> {
  if (url === lastUrl && lastResult) return lastResult;
  lastUrl = url;
  lastResult = withTimeout(
    processAuthLink(url, supabase.auth),
    7000,
    { status: 'error', message: 'Confirmation timed out. Please sign in to continue.' },
  );
  return lastResult;
}
