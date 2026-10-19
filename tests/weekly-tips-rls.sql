begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select public.hours_save_weekly_tips('2026-09-28',10000);
select public.hours_save_weekly_tips('2026-10-05',5000);
select public.hours_save_weekly_tips('2026-10-05',6000);
do $$ begin
 assert (select jsonb_array_length(entries) from public.hours_finance_months where month='2026-10-01')=2;
 assert (select sum((e->>'received_cents')::int) from public.hours_finance_months,jsonb_array_elements(entries) e)=16000;
 begin perform public.hours_save_weekly_tips('2026-10-06',100);raise exception 'Non-Monday accepted';exception when raise_exception then assert sqlerrm='Semana ou valor inválido.';end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $$ begin assert (select count(*) from public.hours_finance_months)=0;end $$;
select public.hours_save_weekly_tips('2026-10-05',2000);
do $$ begin assert (select sum((e->>'received_cents')::int) from public.hours_finance_months,jsonb_array_elements(entries) e)=2000;end $$;
set local role anon;
do $$ begin begin perform public.hours_save_weekly_tips('2026-10-05',100);raise exception 'Anonymous access';exception when insufficient_privilege then null;end;end $$;
rollback;
