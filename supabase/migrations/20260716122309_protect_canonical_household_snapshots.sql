create or replace function public.protect_canonical_household_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.state #>> '{syncMeta,schema}' = '1' then
    if coalesce((new.state ->> 'updatedAt')::bigint, -1) <> new.updated_at then
      raise exception 'household snapshot revision must match state updatedAt'
        using errcode = '23514';
    end if;

    if tg_op = 'INSERT' then
      if new.updated_at <= 0 then
        raise exception 'household snapshot revision must be positive'
          using errcode = '23514';
      end if;
    elsif new.updated_at <= old.updated_at then
      raise exception 'household snapshot revision must increase'
        using errcode = '23514';
    end if;
  elsif tg_op = 'UPDATE' and old.state #>> '{syncMeta,schema}' = '1' then
    raise exception 'legacy household snapshot writes are disabled after canonicalization'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_canonical_household_snapshot on public.household_snapshots;
create trigger protect_canonical_household_snapshot
  before insert or update on public.household_snapshots
  for each row execute function public.protect_canonical_household_snapshot();
