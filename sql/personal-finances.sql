-- HOURS only. One atomic monthly record per user; integer cents avoid rounding loss.
create function public.hours_valid_finance_entries(entries jsonb)
returns boolean language sql immutable strict
set search_path = ''
as $$
  select case when jsonb_typeof(entries) <> 'array' then false else
    jsonb_array_length(entries) <= 32 and not exists (
      select 1 from jsonb_array_elements(entries) as item(value)
      where jsonb_typeof(value) <> 'object'
        or not (value ?& array['category','destination','expected_cents','received_cents'])
        or (value->>'category') not in ('salary','food','bonus','coverflex','tips','other')
        or (value->>'category') is null
        or (value->>'destination') not in ('bank','cash','meal_card','coverflex')
        or (value->>'destination') is null
        or (value->'expected_cents' <> 'null'::jsonb and
          (jsonb_typeof(value->'expected_cents') <> 'number' or (value->>'expected_cents') !~ '^[0-9]{1,8}$'))
        or (value->'received_cents' <> 'null'::jsonb and
          (jsonb_typeof(value->'received_cents') <> 'number' or (value->>'received_cents') !~ '^[0-9]{1,8}$'))
    ) end
$$;
create table public.hours_finance_months (
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null check (extract(day from month)=1 and month between date '1900-01-01' and date '2100-12-01'),
  entries jsonb not null default '[]'::jsonb check (public.hours_valid_finance_entries(entries)),
  updated_at timestamptz not null default now(),
  primary key (user_id,month)
);
alter table public.hours_finance_months enable row level security;
create policy hours_finance_owner on public.hours_finance_months
  for all to authenticated
  using ((select auth.uid())=user_id)
  with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.hours_finance_months to authenticated;
revoke all on public.hours_finance_months from anon;
comment on table public.hours_finance_months is
  'Private HOURS monthly net income, expected and received cents, separated by category and payment destination. Independent of TIPS.';
