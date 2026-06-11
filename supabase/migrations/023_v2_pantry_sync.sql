-- ─────────────────────────────────────────────────────────────────────────────
-- Stokit V2 cloud backup tables.
--
-- V2 is local-first: each signed-in user is their own "household", keyed by their
-- auth.users id. The app (apps/stokit-v2/core/services/syncEngine.ts) upserts the
-- full pantry + receipts on every change and pulls them back on sign-in when the
-- local store is empty (e.g. after a reinstall).
--
-- IDs are TEXT ("item_…", "receipt_…"), NOT uuid. Timestamps are bigint epoch ms.
-- household_id holds the user's auth.uid() directly (no households FK), so these
-- tables are independent of the V1 `items`/`receipts`/`households` schema and the
-- parse-receipt edge function.
--
-- Idempotent: safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Pantry items ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pantry_items (
  id               text PRIMARY KEY,
  household_id     uuid NOT NULL,
  name             text NOT NULL,
  quantity         numeric,
  unit             text,
  status           text,
  storage_location text,
  store_id         text,
  expiry_date      text,
  created_at       bigint,
  updated_at       bigint
);

CREATE INDEX IF NOT EXISTS idx_pantry_items_household ON pantry_items(household_id);

ALTER TABLE pantry_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pantry_items_own" ON pantry_items;
CREATE POLICY "pantry_items_own" ON pantry_items
  FOR ALL
  USING (household_id = auth.uid())
  WITH CHECK (household_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON pantry_items TO authenticated;

-- ── Receipts (V2 shape — separate from V1 `receipts`) ────────────────────────
CREATE TABLE IF NOT EXISTS pantry_receipts (
  id           text PRIMARY KEY,
  household_id uuid NOT NULL,
  trip_id      text,
  store_id     text,
  amount       numeric,
  status       text,
  image_uri    text,
  created_at   bigint
);

CREATE INDEX IF NOT EXISTS idx_pantry_receipts_household ON pantry_receipts(household_id);

ALTER TABLE pantry_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pantry_receipts_own" ON pantry_receipts;
CREATE POLICY "pantry_receipts_own" ON pantry_receipts
  FOR ALL
  USING (household_id = auth.uid())
  WITH CHECK (household_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON pantry_receipts TO authenticated;

-- ── Realtime (so other devices get live updates) ─────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE pantry_items;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE pantry_receipts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
