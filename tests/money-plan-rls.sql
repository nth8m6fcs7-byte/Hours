begin;
insert into auth.users(id) values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
insert into public.hours_money_plan(user_id,bank_cents,cash_cents,bills_cents,savings_cents,benefits_cents) values(auth.uid(),120000,10000,60000,20000,74358);
do $$ begin
 assert (select bank_cents+cash_cents-bills_cents-savings_cents from public.hours_money_plan)=50000;
 begin insert into public.hours_money_plan(user_id) values('00000000-0000-0000-0000-000000000002');raise exception 'Cross-account insert accepted';exception when insufficient_privilege then null;end;
 begin update public.hours_money_plan set cash_cents=-1 where user_id=auth.uid();raise exception 'Negative cash accepted';exception when check_violation then null;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $$ begin assert (select count(*) from public.hours_money_plan)=0;end $$;
set local role anon;
do $$ begin begin perform * from public.hours_money_plan;raise exception 'Anonymous read accepted';exception when insufficient_privilege then null;end;end $$;
rollback;
