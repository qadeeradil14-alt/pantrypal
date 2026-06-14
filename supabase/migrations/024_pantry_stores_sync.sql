-- ─────────────────────────────────────────────────────────────────────────────
-- Stokit V2 — cloud backup for saved stores (logos, addresses, place IDs).
--
-- Stores only lived in AsyncStorage before this migration. Signing out wiped
-- them with no way to restore, because only pantry_items/receipts were synced.
-- This table backs up the full store list per user so logos survive sign-out.
--
-- Idempotent: safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pantry_stores (
  id             text PRIMARY KEY,
  household_id   uuid NOT NULL,
  name           text NOT NULL,
  logo_color     text,
  logo_emoji     text,
  logo_url       text,
  place_id       text,
  address        text,
  lat            numeric,
  lng            numeric,
  opening_hours  text,
  is_open        boolean,
  created_at     bigint,
  updated_at     bigint
);

CREATE INDEX IF NOT EXISTS idx_pantry_stores_household ON pantry_stores(household_id);

ALTER TABLE pantry_stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pantry_stores_own" ON pantry_stores;
CREATE POLICY "pantry_stores_own" ON pantry_stores
  FOR ALL
  USING (household_id = auth.uid())
  WITH CHECK (household_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON pantry_stores TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE pantry_stores;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
