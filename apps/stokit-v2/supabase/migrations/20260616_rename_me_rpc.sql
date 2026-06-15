-- rename_me: let a user update their own display_name across all their households.
-- Uses SECURITY DEFINER so it bypasses RLS (same pattern as all other household RPCs).
create or replace function public.rename_me(p_display_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.household_members
  set display_name = coalesce(nullif(trim(p_display_name), ''), 'Me')
  where user_id = auth.uid();
end;
$$;

grant execute on function public.rename_me(text) to authenticated;
