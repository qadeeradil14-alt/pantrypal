-- Receipts and spend tracking

CREATE TABLE receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid REFERENCES households(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES auth.users(id),
  store_name text,
  transaction_date date,
  total_amount numeric(10,2),
  image_url text,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'done', 'failed')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid REFERENCES receipts(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity numeric(10,2) DEFAULT 1,
  unit_price numeric(10,2),
  total_price numeric(10,2),
  matched_item_id uuid REFERENCES items(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_receipts_household ON receipts(household_id, created_at DESC);
CREATE INDEX idx_receipt_items_receipt ON receipt_items(receipt_id);

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "receipts_own_household" ON receipts
  FOR ALL USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "receipt_items_own_household" ON receipt_items
  FOR ALL USING (
    receipt_id IN (
      SELECT id FROM receipts WHERE household_id IN (
        SELECT household_id FROM household_members WHERE user_id = auth.uid()
      )
    )
  );
