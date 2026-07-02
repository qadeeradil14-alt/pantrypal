CREATE OR REPLACE FUNCTION household_member_limit(p_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p_plan = 'paid' THEN 5 ELSE 3 END
$$;
