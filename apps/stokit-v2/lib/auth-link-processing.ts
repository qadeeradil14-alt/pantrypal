export type AuthLinkResult<TSession = unknown> =
  | { status: 'success'; session: TSession | null }
  | { status: 'ignored' }
  | { status: 'error'; message: string };

export type AuthCallbackPresentation = {
  statusText: string;
  signInMessage: string;
};

type AuthResponse<TSession> = Promise<{
  data: { session: TSession | null };
  error: unknown;
}>;

export interface AuthLinkClient<TSession = unknown> {
  exchangeCodeForSession: (code: string) => AuthResponse<TSession>;
  setSession: (tokens: { access_token: string; refresh_token: string }) => AuthResponse<TSession>;
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function getAuthCallbackPresentation(
  result: AuthLinkResult<unknown>,
): AuthCallbackPresentation {
  if (result.status === 'ignored') {
    return {
      statusText: 'Email confirmation could not be completed.',
      signInMessage: 'The confirmation link was incomplete. Open the full link from your email or request a new one.',
    };
  }

  if (result.status === 'error') {
    return {
      statusText: `Email confirmation failed. ${result.message}`,
      signInMessage: result.message,
    };
  }

  return {
    statusText: 'Email confirmed. Please sign in.',
    signInMessage: 'Email confirmed. Please sign in.',
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'This confirmation link is invalid or expired. Please sign in or request a new email.';
}

function parseAuthUrl(url: string) {
  try {
    const normalised = url.replace(/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//, 'https://stokit.app/');
    const parsed = new URL(normalised);
    const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    return {
      code: parsed.searchParams.get('code'),
      accessToken: fragment.get('access_token') ?? parsed.searchParams.get('access_token'),
      refreshToken: fragment.get('refresh_token') ?? parsed.searchParams.get('refresh_token'),
      providerError:
        fragment.get('error_description') ??
        parsed.searchParams.get('error_description') ??
        fragment.get('error') ??
        parsed.searchParams.get('error'),
    };
  } catch {
    return { code: null, accessToken: null, refreshToken: null, providerError: null };
  }
}

export async function processAuthLink<TSession>(
  url: string,
  auth: AuthLinkClient<TSession>,
): Promise<AuthLinkResult<TSession>> {
  const { code, accessToken, refreshToken, providerError } = parseAuthUrl(url);

  if (providerError) return { status: 'error', message: providerError };

  if (code) {
    const { data, error } = await auth.exchangeCodeForSession(code);
    if (error) return { status: 'error', message: errorMessage(error) };
    return { status: 'success', session: data.session };
  }

  if (accessToken && refreshToken) {
    const { data, error } = await auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) return { status: 'error', message: errorMessage(error) };
    return { status: 'success', session: data.session };
  }

  return { status: 'ignored' };
}
