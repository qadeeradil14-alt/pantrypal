-- A push_token has no ownership guarantee today: household_members.push_token
-- is a plain nullable text column with no uniqueness enforcement, so the same
-- physical device's Expo token can end up stored against a stale user_id (e.g.
-- James signed out, Sarah signed into the same device) as well as the current
-- owner. Every notify Edge Function excludes the sender by user_id only, so a
-- stale row under a *different* user_id still supplies the sender's own
-- physical token and the sender receives their own push.
--
-- A hard UNIQUE(push_token) constraint doesn't fit this schema: one user can
-- legitimately hold the same token across multiple of their OWN rows (their
-- personal household + a shared household), so uniqueness must be "one token,
-- one user_id" — not "one token, one row". Enforce that with a trigger that
-- runs on every write path (present and future) rather than trusting each
-- caller to remember to clean up: whenever a row's push_token is set to a
-- non-null value, atomically null out that same token on any OTHER user's
-- rows, in the same transaction.

CREATE OR REPLACE FUNCTION public.enforce_push_token_single_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.push_token IS NOT NULL THEN
    UPDATE public.household_members
    SET push_token = NULL
    WHERE push_token = NEW.push_token
      AND user_id <> NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS household_members_push_token_single_owner ON public.household_members;

CREATE TRIGGER household_members_push_token_single_owner
  BEFORE INSERT OR UPDATE OF push_token ON public.household_members
  FOR EACH ROW
  WHEN (NEW.push_token IS NOT NULL)
  EXECUTE FUNCTION public.enforce_push_token_single_owner();

-- One-time cleanup: for each token currently shared across more than one
-- user_id, pick a single winning owner (the user_id with the most recently
-- joined row holding that token — the only per-row timestamp this table has)
-- and null the token out of every OTHER user's rows. All of the winning
-- user's own rows (personal + shared household memberships) are left intact,
-- since same-user duplication across their own rows is expected, not stale.
WITH token_owner AS (
  SELECT push_token, user_id
  FROM (
    SELECT push_token, user_id,
           ROW_NUMBER() OVER (PARTITION BY push_token ORDER BY joined_at DESC) AS rn
    FROM public.household_members
    WHERE push_token IS NOT NULL
  ) ranked
  WHERE rn = 1
)
UPDATE public.household_members hm
SET push_token = NULL
FROM token_owner o
WHERE hm.push_token = o.push_token
  AND hm.user_id <> o.user_id;
