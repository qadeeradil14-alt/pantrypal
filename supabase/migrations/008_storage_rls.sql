-- Migration 008: Storage RLS policies for receipts bucket
-- Grants authenticated household members upload, read, and delete access
-- to the receipts/ folder scoped to their household_id.
-- Without these policies, Supabase Storage blocks ALL operations even for
-- valid authenticated users (storage.objects RLS is separate from table RLS).

-- Allow household members to upload receipts to their household folder
CREATE POLICY "receipts_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1] IN (
      SELECT household_id::text FROM household_members WHERE user_id = auth.uid()
    )
  );

-- Allow household members to read their household's receipts
CREATE POLICY "receipts_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1] IN (
      SELECT household_id::text FROM household_members WHERE user_id = auth.uid()
    )
  );

-- Allow household members to delete their household's receipts
CREATE POLICY "receipts_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1] IN (
      SELECT household_id::text FROM household_members WHERE user_id = auth.uid()
    )
  );
