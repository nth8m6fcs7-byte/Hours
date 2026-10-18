-- LOCAL TEST DATABASE ONLY. Requires sql/personal-finances.sql after the auth fixture.
-- Run only in an isolated PostgreSQL instance with two fictitious users.
begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
do $$ begin
 assert public.hours_valid_finance_entries('[{"category":"salary","destination":"bank","expected_cents":100,"received_cents":100}]');
 assert public.hours_valid_finance_entries('[{"category":"food","destination":"meal_card","expected_cents":null,"received_cents":0}]');
 assert not public.hours_valid_finance_entries('{}');
 assert not public.hours_valid_finance_entries('[{}]');
 assert not public.hours_valid_finance_entries('[{"category":"salary","destination":"bank","expected_cents":-1,"received_cents":null}]');
 assert not public.hours_valid_finance_entries('[{"category":"salary","destination":"bank","expected_cents":1.2,"received_cents":null}]');
 assert not public.hours_valid_finance_entries('[{"category":"salary","destination":"bank","expected_cents":"100","received_cents":null}]');
 assert not public.hours_valid_finance_entries('[{"category":"salary","destination":"bank","expected_cents":100000000,"received_cents":null}]');
 assert not public.hours_valid_finance_entries('[{"category":"unknown","destination":"bank","expected_cents":null,"received_cents":null}]');
end $$;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
insert into public.hours_finance_months(user_id,month,entries) values
(auth.uid(),'2026-10-01','[{"category":"salary","destination":"bank","expected_cents":100,"received_cents":100}]')
on conflict(user_id,month) do update set entries=excluded.entries;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
insert into public.hours_finance_months(user_id,month,entries) values
(auth.uid(),'2026-10-01','[{"category":"coverflex","destination":"coverflex","expected_cents":200,"received_cents":200}]');
do $$ declare affected integer; begin
 assert (select count(*) from public.hours_finance_months)=1;
 assert (select (entries->0->>'received_cents')::integer from public.hours_finance_months)=200;
 begin
  insert into public.hours_finance_months(user_id,month) values ('00000000-0000-0000-0000-000000000001','2026-09-01');
  raise exception 'Forged insert was accepted';
 exception when insufficient_privilege then null; end;
 begin
  update public.hours_finance_months set user_id='00000000-0000-0000-0000-000000000001' where user_id=auth.uid();
  raise exception 'Owner reassignment was accepted';
 exception when insufficient_privilege then null; end;
 delete from public.hours_finance_months where user_id='00000000-0000-0000-0000-000000000001';
 get diagnostics affected=row_count;assert affected=0;
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$ begin
 assert (select count(*) from public.hours_finance_months)=1;
 begin
  insert into public.hours_finance_months(user_id,month,entries) values(auth.uid(),'2026-10-01','[{"category":"salary","destination":"bank","expected_cents":-1,"received_cents":null}]')
  on conflict(user_id,month) do update set entries=excluded.entries;
  raise exception 'Invalid upsert was accepted';
 exception when check_violation then null; end;
 assert (select (entries->0->>'received_cents')::integer from public.hours_finance_months)=100;
end $$;
set local request.jwt.claim.sub='';
do $$ begin assert (select count(*) from public.hours_finance_months)=0; end $$;
set local role anon;
do $$ begin
 begin perform * from public.hours_finance_months;raise exception 'Anonymous access was accepted';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'Finance validation, atomic upsert and owner isolation: passed' as result;
