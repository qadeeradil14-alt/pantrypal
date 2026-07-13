import { FunctionsHttpError } from '@supabase/supabase-js';

export interface FunctionErrorDetail {
  status: number | null;
  code: string | null;
  serverMessage: string | null;
  log: string;
}

export async function readFunctionError(error: unknown): Promise<FunctionErrorDetail> {
  const message = error instanceof Error ? error.message : String(error);
  if (!(error instanceof FunctionsHttpError)) {
    return { status: null, code: null, serverMessage: null, log: message };
  }

  const response = error.context as Response;
  let body: unknown = null;
  try {
    body = await response.clone().json();
  } catch {
    try {
      body = await response.clone().text();
    } catch {}
  }

  const record = body && typeof body === 'object' ? body as Record<string, unknown> : null;
  const code = typeof record?.error === 'string' ? record.error : null;
  const serverMessage = typeof record?.message === 'string' ? record.message : null;
  const bodyText = typeof body === 'string' ? body : body ? JSON.stringify(body) : '';
  const prefix = `HTTP ${response.status}`;
  const detail = [code, serverMessage, bodyText].filter(Boolean).join(' | ');

  return {
    status: response.status,
    code,
    serverMessage,
    log: detail ? `${prefix}: ${detail}` : `${prefix}: ${message}`,
  };
}
