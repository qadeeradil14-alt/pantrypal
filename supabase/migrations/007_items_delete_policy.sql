-- Migration 007: Add DELETE policy for items table
-- Allows household members to delete items that belong to their household.
-- Without this policy, RLS blocks all DELETE operations even for valid members.

CREATE POLICY "items_household_delete" ON items
  FOR DELETE
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );
