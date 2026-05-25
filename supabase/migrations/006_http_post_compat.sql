-- Compatibility shim for projects that have triggers calling extensions.http_post(...)
-- but do not have the pg_net/HTTP extension function installed.
--
-- This prevents item updates from failing with:
-- "function extensions.http_post(url => unknown, body => text, headers => jsonb) does not exist"
--
-- Note: this shim is a no-op. It keeps writes working; webhook delivery still
-- requires proper Supabase Database Webhook configuration in dashboard.

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE OR REPLACE FUNCTION extensions.http_post(
  url text,
  body text DEFAULT NULL,
  headers jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- No-op fallback to avoid blocking writes when HTTP extension is unavailable.
  RETURN NULL;
END;
$$;
