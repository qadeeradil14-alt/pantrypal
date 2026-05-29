DELETE FROM stores a
USING stores b
WHERE a.household_id = b.household_id
  AND lower(a.name) = lower(b.name)
  AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_household_unique_lower_name
  ON stores (household_id, lower(name));
