type SignUpResponseLike = {
  session?: unknown;
  user?: {
    identities?: unknown[] | null;
  } | null;
};

export function isExistingAccountSignUpResponse(data: SignUpResponseLike | null | undefined): boolean {
  return !data?.session && Array.isArray(data?.user?.identities) && data.user.identities.length === 0;
}
