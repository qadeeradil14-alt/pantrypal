-- Fix wrong barcode-scan data created before the inferCategory personal-care guard.
-- Safe to re-run: uses WHERE clauses that only affect the specific bad records.

-- 1. Dial hand soap was mis-categorised as 'fridge' with a 7-day auto-filled expiry.
--    Move it to 'pantry' and clear the bogus expiry date.
UPDATE items
SET
  category   = 'pantry',
  expires_at = NULL
WHERE
  name ILIKE '%Dial%'
  AND category = 'fridge';

-- 2. Global Food store has a wrong brand_domain that causes a wrong "S" logo to load.
--    Clear brand data so it falls back to initials / app-icon.
UPDATE stores
SET
  brand_domain = NULL,
  logo_url     = NULL
WHERE
  name = 'Global Food'
  AND (brand_domain IS NOT NULL OR logo_url IS NOT NULL);

-- Note: wrong-state stores (7 eleven CA, Food Lion CA, Walmart CA) should be
-- removed by the user from the Stores tab — they appear with a ⚠️ warning badge
-- in Build 32 and can be deleted safely via the Remove button.
