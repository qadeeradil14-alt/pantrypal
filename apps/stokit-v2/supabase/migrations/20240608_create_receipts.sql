-- Create the receipts storage bucket
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false);

create policy "receipt image owner access"
  on storage.objects for all to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

-- Create the receipts table
CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    status TEXT NOT NULL,
    image_uri TEXT,
    household_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "receipt owner access"
ON receipts
FOR ALL
TO authenticated
USING (household_id = auth.uid())
WITH CHECK (household_id = auth.uid());

-- Enable realtime broadcasting
alter publication supabase_realtime add table receipts;
