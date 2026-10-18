-- LOCAL ONLY: isolated auth and storage fixtures from finance-db.sh.
begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
insert into public.hours_finance_months(user_id,month,entries) values(auth.uid(),'2026-10-01','[{"category":"tips","destination":"cash","expected_cents":5000,"received_cents":5000}]');
insert into public.hours_finance_documents(id,user_id,sha256,kind,filename,object_path,income_month) values
 ('10000000-0000-0000-0000-000000000001',auth.uid(),repeat('a',64),'payroll','payroll.pdf',auth.uid()::text||'/a.pdf','2026-10-01'),
 ('10000000-0000-0000-0000-000000000002',auth.uid(),repeat('b',64),'coverflex','coverflex.pdf',auth.uid()::text||'/b.pdf','2026-10-01'),
 ('10000000-0000-0000-0000-000000000003',auth.uid(),repeat('c',64),'coverflex','invalid.pdf',auth.uid()::text||'/c.pdf','2026-10-01');
select public.hours_confirm_finance_document('10000000-0000-0000-0000-000000000001','2026-10-01','2026-10-01','2026-09-01','{"salary":84000,"food":10000,"ppr":30000}',true);
select public.hours_confirm_finance_document('10000000-0000-0000-0000-000000000002','2026-10-01',null,null,'{"food":10000,"bonus":20000}',true);
do $$ begin
 assert (select sum((value->>'received_cents')::integer) from public.hours_finance_months,jsonb_array_elements(entries) where month='2026-10-01')=119000;
 assert (select ppr_redemption_cents from public.hours_finance_months where month='2026-10-01')=30000;
 assert (select ppr_origin_month from public.hours_finance_months where month='2026-10-01')=date '2026-09-01';
 begin
  perform public.hours_confirm_finance_document('10000000-0000-0000-0000-000000000001','2026-10-01','2026-10-01',null,'{"salary":84000,"food":10000,"ppr":30000}',true);
  raise exception using errcode='ZX001',message='Repeated document accepted';
 exception when sqlstate 'P0001' then null; end;
 begin
  perform public.hours_confirm_finance_document('10000000-0000-0000-0000-000000000003','2026-10-01',null,null,'{"bonus":-1}',true);
  raise exception using errcode='ZX001',message='Negative amount accepted';
 exception when sqlstate 'P0001' then null; end;
 assert (select status from public.hours_finance_documents where filename='invalid.pdf')='draft';
end $$;
insert into storage.objects(bucket_id,name) values('hours-receipts',auth.uid()::text||'/a.pdf');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $$ begin
 assert (select count(*) from public.hours_finance_documents)=0;
 assert (select count(*) from storage.objects where bucket_id='hours-receipts')=0;
 begin
  perform public.hours_confirm_finance_document('10000000-0000-0000-0000-000000000003','2026-10-01',null,null,'{"bonus":100}',true);
  raise exception using errcode='ZX001',message='Other user document accepted';
 exception when sqlstate 'P0001' then null; end;
 begin
  insert into storage.objects(bucket_id,name) values('hours-receipts','00000000-0000-0000-0000-000000000001/forged.pdf');
  raise exception 'Other user storage path accepted';
 exception when insufficient_privilege then null; end;
end $$;
-- Existing app storage stays accessible; the restrictive policy scopes only the new bucket.
insert into storage.objects(bucket_id,name) values('unrelated-app','shared/file.pdf');
set local role anon;
set local request.jwt.claim.sub='';
do $$ begin
 assert (select count(*) from storage.objects where bucket_id='hours-receipts')=0;
 assert (select count(*) from storage.objects where bucket_id='unrelated-app')=1;
 begin perform * from public.hours_finance_documents;raise exception 'Anonymous documents accepted';
 exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'Private document storage, atomic import and PPR non-duplication passed' as result;
