ALTER TABLE store_arrivals
  ADD COLUMN IF NOT EXISTS arrived_by_name text;
