-- Household creation/join helpers that run with definer privileges.
-- This avoids RLS deadlocks during create/join while keeping table policies strict.

CREATE OR REPLACE FUNCTION create_household_with_owner(
  p_name text,
  p_invite_code text
)
RETURNS TABLE (
  id uuid,
  name text,
  invite_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household households%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO households(name, invite_code)
  VALUES (trim(p_name), upper(trim(p_invite_code)))
  RETURNING * INTO v_household;

  INSERT INTO household_members(household_id, user_id, role)
  VALUES (v_household.id, auth.uid(), 'owner')
  ON CONFLICT (household_id, user_id) DO NOTHING;

  RETURN QUERY
  SELECT v_household.id, v_household.name, v_household.invite_code;
END;
$$;

CREATE OR REPLACE FUNCTION join_household_by_code(
  p_invite_code text
)
RETURNS TABLE (
  id uuid,
  name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household households%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO v_household
  FROM households
  WHERE invite_code = upper(trim(p_invite_code))
  LIMIT 1;

  IF v_household.id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  INSERT INTO household_members(household_id, user_id, role)
  VALUES (v_household.id, auth.uid(), 'member')
  ON CONFLICT (household_id, user_id) DO NOTHING;

  RETURN QUERY
  SELECT v_household.id, v_household.name;
END;
$$;

REVOKE ALL ON FUNCTION create_household_with_owner(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION join_household_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_household_with_owner(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION join_household_by_code(text) TO authenticated;
