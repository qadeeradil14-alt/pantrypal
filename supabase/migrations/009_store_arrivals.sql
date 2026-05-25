CREATE TABLE store_arrivals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid REFERENCES households(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  arrived_by uuid REFERENCES auth.users(id),
  arrived_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_store_arrivals_household_time ON store_arrivals(household_id, arrived_at DESC);

ALTER TABLE store_arrivals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_arrivals_read_own_household" ON store_arrivals
  FOR SELECT USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "store_arrivals_insert_own_household" ON store_arrivals
  FOR INSERT WITH CHECK (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE store_arrivals;
