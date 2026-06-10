-- Create the receipts storage bucket
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', true);

-- Allow public read access
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'receipts' );

-- Allow public insert access for the prototype
create policy "Public Insert"
  on storage.objects for insert
  with check ( bucket_id = 'receipts' );

-- Create the receipts table
CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    status TEXT NOT NULL,
    image_uri TEXT,
    household_id TEXT,
    created_at BIGINT NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public access for the prototype
CREATE POLICY "Enable public read/write access for prototype"
ON receipts
FOR ALL
USING (true)
WITH CHECK (true);

-- Enable realtime broadcasting
alter publication supabase_realtime add table receipts;
