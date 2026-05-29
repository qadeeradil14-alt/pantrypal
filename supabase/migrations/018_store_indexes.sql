CREATE INDEX IF NOT EXISTS idx_stores_household_lower_name ON stores (household_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_stores_brand ON stores (store_brand_id) WHERE store_brand_id IS NOT NULL;
