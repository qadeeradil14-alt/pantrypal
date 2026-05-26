-- Partner push: on store_arrivals INSERT, call notify-store-arrival edge function.
-- Uses net.http_post (pg_net) — same stack as other async HTTP on this project.

CREATE OR REPLACE FUNCTION public.notify_store_arrival()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://yndhbbnstqqsrqjelejg.supabase.co/functions/v1/notify-store-arrival',
    body := to_jsonb(NEW),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-supabase-signature', '4ba09e92f4c4cfd6530200ba5deb2c2ff66b21f2396ec6aa46b70626a6f33f3'
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS store_arrivals_notify ON public.store_arrivals;

CREATE TRIGGER store_arrivals_notify
  AFTER INSERT ON public.store_arrivals
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_store_arrival();
