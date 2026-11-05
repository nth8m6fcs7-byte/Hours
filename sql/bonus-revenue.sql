-- Monthly restaurant revenue used to check the 0.5% bonus paid in this month.
alter table public.hours_finance_months
 add column bonus_revenue_cents integer check(bonus_revenue_cents between 0 and 99999999),
 add column bonus_revenue_month date check(extract(day from bonus_revenue_month)=1 and bonus_revenue_month between date '1900-01-01' and date '2100-12-01' and bonus_revenue_month<=month),
 add constraint hours_bonus_revenue_pair check((bonus_revenue_cents is null)=(bonus_revenue_month is null));
