begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
insert into public.hours_finance_months(user_id,month,bonus_revenue_cents,bonus_revenue_month)
 values(auth.uid(),'2026-12-01',10000000,'2026-10-01');
do $$begin
 if (select round(bonus_revenue_cents::numeric/200) from public.hours_finance_months where month='2026-12-01')<>50000 then raise exception 'Wrong forecast';end if;
 begin update public.hours_finance_months set bonus_revenue_month='2027-01-01' where user_id=auth.uid();raise exception 'Future origin accepted';exception when check_violation then null;end;
 begin update public.hours_finance_months set bonus_revenue_cents=-1 where user_id=auth.uid();raise exception 'Negative revenue accepted';exception when check_violation then null;end;
 begin update public.hours_finance_months set bonus_revenue_month=null where user_id=auth.uid();raise exception 'Unpaired revenue accepted';exception when check_violation then null;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $$begin
 if exists(select 1 from public.hours_finance_months where bonus_revenue_cents is not null) then raise exception 'Revenue leaked';end if;
 update public.hours_finance_months set bonus_revenue_cents=0,bonus_revenue_month='2026-10-01' where month='2026-12-01';if found then raise exception 'Other owner changed';end if;
end $$;
rollback;
