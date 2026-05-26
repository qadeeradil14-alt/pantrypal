-- Migration 014: Move webhook secret from hardcoded literal to database configuration.
--
-- SETUP REQUIRED before deploying this migration:
--   1. Generate a new secret: openssl rand -hex 32
--   2. Set it in Supabase Dashboard → Settings → Edge Functions → Environment Variables
--      Key: WEBHOOK_SECRET  Value: <your-new-secret>
--   3. Set the same value in the database config (run this in SQL Editor — NOT a migration):
--      ALTER DATABASE postgres SET "app.webhook_secret" = '<your-new-secret>';
--   4. Then run this migration.
--
-- This migration re-creates the two trigger functions to read the secret from
-- PostgreSQL configuration (app.webhook_secret) rather than a hardcoded literal.
-- The old literal '4ba09e92f4c4cfd6530200ba5deb2c2ff66b21f2396ec6aa46b70626a6f33f3'
-- must be treated as compromised — rotate it immediately.

CREATE OR REPLACE FUNCTION public.notify_store_arrival()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text := current_setting('app.webhook_secret', false);
BEGIN
  PERFORM net.http_post(
    url := 'https://yndhbbnstqqsrqjelejg.supabase.co/functions/v1/notify-store-arrival',
    body := to_jsonb(NEW),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-supabase-signature', v_secret
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_item_low()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text := current_setting('app.webhook_secret', false);
BEGIN
  IF NEW.is_low IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_low IS NOT DISTINCT FROM TRUE AND OLD.marked_low_by IS NOT DISTINCT FROM NEW.marked_low_by THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://yndhbbnstqqsrqjelejg.supabase.co/functions/v1/notify-low-item',
    body := to_jsonb(NEW),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-supabase-signature', v_secret
    )
  );
  RETURN NEW;
END;
$$;
