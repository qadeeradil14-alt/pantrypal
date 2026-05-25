-- Stores and store-item associations

CREATE TABLE stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid REFERENCES households(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  latitude double precision,
  longitude double precision,
  radius_meters integer NOT NULL DEFAULT 150,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_stores_household ON stores(household_id);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stores_own_household" ON stores
  FOR ALL USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- Add preferred store to items
ALTER TABLE items ADD COLUMN preferred_store_id uuid REFERENCES stores(id) ON DELETE SET NULL;
