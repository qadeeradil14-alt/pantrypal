-- Create the pantry_items table
CREATE TABLE IF NOT EXISTS pantry_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 1,
    unit TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'stocked',
    storage_location TEXT NOT NULL,
    store_id TEXT,
    expiry_date TEXT,
    household_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE pantry_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pantry item owner access"
ON pantry_items
FOR ALL
TO authenticated
USING (household_id = auth.uid())
WITH CHECK (household_id = auth.uid());

-- Enable realtime broadcasting for optimistic UI sync
alter publication supabase_realtime add table pantry_items;
