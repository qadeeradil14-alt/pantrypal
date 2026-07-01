ALTER TABLE households
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_personal boolean NOT NULL DEFAULT false;

ALTER TABLE household_members
  ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT 'Me';

CREATE OR REPLACE FUNCTION generate_household_invite()
RETURNS text
LANGUAGE sql
AS $$
  SELECT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;

CREATE OR REPLACE FUNCTION remove_household_member(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_id uuid := auth.uid();
  current_id uuid;
  target_role text;
  target_name text;
  owner_count integer;
  target_personal_id uuid;
  new_id uuid;
BEGIN
  IF requester_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Select a household member to remove';
  END IF;

  IF target_user_id = requester_id THEN
    RAISE EXCEPTION 'Owners cannot remove themselves. Remove members before leaving or deleting this household.';
  END IF;

  SELECT h.id
  INTO current_id
  FROM profiles p
  JOIN households h ON h.id = p.household_id
  JOIN household_members me ON me.household_id = h.id AND me.user_id = requester_id
  WHERE p.id = requester_id
    AND me.role = 'owner'
    AND NOT h.is_personal
  LIMIT 1;

  IF current_id IS NULL THEN
    SELECT h.id
    INTO current_id
    FROM household_members me
    JOIN households h ON h.id = me.household_id
    WHERE me.user_id = requester_id
      AND me.role = 'owner'
      AND NOT h.is_personal
    ORDER BY me.joined_at DESC
    LIMIT 1;
  END IF;

  IF current_id IS NULL THEN
    RAISE EXCEPTION 'Only the household owner can remove members';
  END IF;

  SELECT role, display_name
  INTO target_role, target_name
  FROM household_members
  WHERE household_id = current_id
    AND user_id = target_user_id
  FOR UPDATE;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'This person is not in your household';
  END IF;

  IF target_role = 'owner' THEN
    RAISE EXCEPTION 'Household owner cannot be removed';
  END IF;

  SELECT count(*)
  INTO owner_count
  FROM household_members
  WHERE household_id = current_id
    AND role = 'owner';

  IF owner_count <> 1 THEN
    RAISE EXCEPTION 'Household must have exactly one owner';
  END IF;

  SELECT h.id
  INTO target_personal_id
  FROM household_members m
  JOIN households h ON h.id = m.household_id
  WHERE m.user_id = target_user_id
    AND h.is_personal
  LIMIT 1;

  IF target_personal_id IS NULL THEN
    new_id := gen_random_uuid();
    INSERT INTO households (id, name, invite_code, owner_id, is_personal)
    VALUES (new_id, 'My Pantry', generate_household_invite(), target_user_id, true);
    INSERT INTO household_members (household_id, user_id, display_name, role)
    VALUES (new_id, target_user_id, coalesce(nullif(trim(target_name), ''), 'Me'), 'owner');
    target_personal_id := new_id;
  END IF;

  DELETE FROM household_members
  WHERE household_id = current_id
    AND user_id = target_user_id
    AND role = 'member';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Could not remove household member';
  END IF;

  INSERT INTO profiles (id, household_id)
  VALUES (target_user_id, target_personal_id)
  ON CONFLICT (id)
  DO UPDATE SET
    household_id = excluded.household_id,
    updated_at = now();

  RETURN public.my_household();
END;
$$;

REVOKE ALL ON FUNCTION remove_household_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION remove_household_member(uuid) TO authenticated;
