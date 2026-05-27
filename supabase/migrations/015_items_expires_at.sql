-- Add optional expiry date to pantry items.
-- Consumers can set this to track freshness and surface "expiring soon" warnings.
ALTER TABLE items ADD COLUMN IF NOT EXISTS expires_at timestamptz;
