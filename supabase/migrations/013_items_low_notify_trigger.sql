-- Low-item push: on items UPDATE when marked low, call notify-low-item edge function.
-- Uses net.http_post (pg_net) — extensions.http_post is a no-op shim on this project.

CREATE OR REPLACE FUNCTION public.notify_item_low()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      'x-supabase-signature', current_setting('app.webhook_secret', true)
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS items_notify_low ON public.items;

CREATE TRIGGER items_notify_low
  AFTER INSERT OR UPDATE OF is_low, marked_low_by ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_item_low();
