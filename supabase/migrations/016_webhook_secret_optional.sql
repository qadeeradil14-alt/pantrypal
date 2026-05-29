CREATE OR REPLACE FUNCTION public.notify_store_arrival()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text := current_setting('app.webhook_secret', true);
BEGIN
  IF v_secret IS NULL OR btrim(v_secret) = '' THEN
    RETURN NEW;
  END IF;

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
  v_secret text := current_setting('app.webhook_secret', true);
BEGIN
  IF NEW.is_low IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_low IS NOT DISTINCT FROM TRUE AND OLD.marked_low_by IS NOT DISTINCT FROM NEW.marked_low_by THEN
    RETURN NEW;
  END IF;

  IF v_secret IS NULL OR btrim(v_secret) = '' THEN
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
