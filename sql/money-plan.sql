-- Private snapshot of manually entered balances and planned reserves.
create table if not exists public.hours_money_plan(
 user_id uuid primary key references auth.users(id) on delete cascade,
 bank_cents integer check(bank_cents between -99999999 and 99999999),
 cash_cents integer check(cash_cents between 0 and 99999999),
 bills_cents integer check(bills_cents between 0 and 99999999),
 savings_cents integer check(savings_cents between 0 and 99999999),
 food_cents integer check(food_cents between 0 and 99999999),
 benefits_cents integer check(benefits_cents between 0 and 99999999),
 next_income_date date check(next_income_date between date '1900-01-01' and date '2100-12-31'),
 updated_at timestamptz not null default now()
);
alter table public.hours_money_plan enable row level security;
create policy hours_money_plan_owner on public.hours_money_plan for all to authenticated
 using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
grant select,insert,update,delete on public.hours_money_plan to authenticated;
revoke all on public.hours_money_plan from anon;
comment on table public.hours_money_plan is 'OTTO manual current balances and planned reserves; separate from earned income. No transaction tracking.';
