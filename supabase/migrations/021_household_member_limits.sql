ALTER TABLE households
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free'
  CHECK (plan IN ('free', 'paid'));

DROP POLICY IF EXISTS "households_members_only" ON households;

CREATE POLICY "households_read_own_membership" ON households
  FOR SELECT USING (
    id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "households_update_owner_only" ON households
  FOR UPDATE USING (
    id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid() AND role = 'owner'
    )
  )
  WITH CHECK (
    id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

CREATE OR REPLACE FUNCTION prevent_client_household_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND OLD.plan IS DISTINCT FROM NEW.plan THEN
    RAISE EXCEPTION 'Plan changes must be handled by billing';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS households_plan_client_guard ON households;
CREATE TRIGGER households_plan_client_guard
  BEFORE UPDATE OF plan ON households
  FOR EACH ROW
  EXECUTE FUNCTION prevent_client_household_plan_change();

DROP POLICY IF EXISTS "household_members_join" ON household_members;

CREATE OR REPLACE FUNCTION household_member_limit(p_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p_plan = 'paid' THEN 5 ELSE 2 END
$$;

CREATE OR REPLACE FUNCTION enforce_household_member_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_count integer;
  v_limit integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM household_members
    WHERE household_id = NEW.household_id
      AND user_id = NEW.user_id
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.household_id::text, 0));

  SELECT COALESCE(plan, 'free')
  INTO v_plan
  FROM households
  WHERE id = NEW.household_id
  FOR UPDATE;

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Household not found';
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM household_members
  WHERE household_id = NEW.household_id;

  v_limit := household_member_limit(v_plan);

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Household member limit reached'
      USING ERRCODE = 'P0001',
            DETAIL = format('This %s household allows up to %s members.', v_plan, v_limit);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS household_members_limit_guard ON household_members;
CREATE TRIGGER household_members_limit_guard
  BEFORE INSERT ON household_members
  FOR EACH ROW
  EXECUTE FUNCTION enforce_household_member_limit();

DROP FUNCTION IF EXISTS create_household_with_owner(text, text);

CREATE FUNCTION create_household_with_owner(
  p_name text,
  p_invite_code text
)
RETURNS TABLE (
  id uuid,
  name text,
  invite_code text,
  plan text
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

  INSERT INTO households(name, invite_code, plan)
  VALUES (trim(p_name), upper(trim(p_invite_code)), 'free')
  RETURNING * INTO v_household;

  INSERT INTO household_members(household_id, user_id, role)
  VALUES (v_household.id, auth.uid(), 'owner')
  ON CONFLICT (household_id, user_id) DO NOTHING;

  RETURN QUERY
  SELECT v_household.id, v_household.name, v_household.invite_code, v_household.plan;
END;
$$;

DROP FUNCTION IF EXISTS join_household_by_code(text);

CREATE FUNCTION join_household_by_code(
  p_invite_code text
)
RETURNS TABLE (
  id uuid,
  name text,
  plan text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household households%ROWTYPE;
  v_already_member boolean;
  v_count integer;
  v_limit integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO v_household
  FROM households
  WHERE invite_code = upper(trim(p_invite_code))
  LIMIT 1
  FOR UPDATE;

  IF v_household.id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM household_members
    WHERE household_id = v_household.id
      AND user_id = auth.uid()
  )
  INTO v_already_member;

  IF NOT v_already_member THEN
    SELECT COUNT(*)
    INTO v_count
    FROM household_members
    WHERE household_id = v_household.id;

    v_limit := household_member_limit(v_household.plan);

    IF v_count >= v_limit THEN
      RAISE EXCEPTION 'Household member limit reached'
        USING ERRCODE = 'P0001',
              DETAIL = format('This %s household allows up to %s members.', v_household.plan, v_limit);
    END IF;
  END IF;

  INSERT INTO household_members(household_id, user_id, role)
  VALUES (v_household.id, auth.uid(), 'member')
  ON CONFLICT (household_id, user_id) DO NOTHING;

  RETURN QUERY
  SELECT v_household.id, v_household.name, v_household.plan;
END;
$$;

REVOKE ALL ON FUNCTION household_member_limit(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_household_with_owner(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION join_household_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_household_with_owner(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION join_household_by_code(text) TO authenticated;
