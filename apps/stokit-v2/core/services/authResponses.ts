type SignUpResponseLike = {
  session?: unknown;
  user?: {
    identities?: unknown[] | null;
  } | null;
};

export function isExistingAccountSignUpResponse(data: SignUpResponseLike | null | undefined): boolean {
  return !data?.session && Array.isArray(data?.user?.identities) && data.user.identities.length === 0;
}

// GoTrue's /user endpoint does a live lookup of auth.users by the JWT's
// subject — unlike PostgREST, it detects a deleted account immediately, even
// before the (still time-valid) access token would otherwise expire.
export function isAccountDeletedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const status = (error as { status?: number }).status;
  const message = ((error as { message?: string }).message ?? '').toLowerCase();
  return (status === 403 || status === 404) && message.includes('not found');
}
