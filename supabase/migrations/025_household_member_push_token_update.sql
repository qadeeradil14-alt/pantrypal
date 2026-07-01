DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'household_members'
      AND policyname = 'household_members_update_own_push_token'
  ) THEN
    CREATE POLICY "household_members_update_own_push_token" ON household_members
      FOR UPDATE
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
