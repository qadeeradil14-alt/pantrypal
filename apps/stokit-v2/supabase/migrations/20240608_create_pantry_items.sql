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
    household_id TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE pantry_items ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public access for the prototype (since auth isn't fully locked down yet)
-- In a real app, this would be restricted to authenticated users matching household_id
CREATE POLICY "Enable public read/write access for prototype"
ON pantry_items
FOR ALL
USING (true)
WITH CHECK (true);

-- Enable realtime broadcasting for optimistic UI sync
alter publication supabase_realtime add table pantry_items;
