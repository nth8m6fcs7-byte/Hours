-- Integration checks run in a transaction and leave no users, payments or balances behind.
begin;
do $$
declare uid uuid; response jsonb; person_a text; person_b text; person_c text; rev integer:=0;
  payload jsonb; final_state jsonb; blocked boolean; gross_sum bigint; paid_sum bigint; balance_sum bigint;
begin
  select id into uid from auth.users where not exists(select 1 from public.personal_tip_ledgers where user_id=auth.users.id) limit 1;
  if uid is null then raise exception 'No unused ledger account available for rollback-only test'; end if;
  perform set_config('request.jwt.claim.sub',uid::text,true);
  response:=public.personal_tip_command('add_staff','{"name":"TEST A","opening":435,"opening_note":"test only","retain":true}',rev);rev:=(response->>'revision')::integer;person_a:=response->'state'->'staff'->0->>'id';
  response:=public.personal_tip_command('add_staff','{"name":"TEST B","opening":320,"opening_note":"test only","retain":true}',rev);rev:=(response->>'revision')::integer;person_b:=response->'state'->'staff'->1->>'id';
  response:=public.personal_tip_command('add_staff','{"name":"TEST EXTRA","opening":0,"retain":false}',rev);rev:=(response->>'revision')::integer;person_c:=response->'state'->'staff'->2->>'id';
  payload:=jsonb_build_object('week','2026-09-21','days','[5000,3500,4000,5500,6000,8000,8000]'::jsonb,'counted',null,'note','','entries',jsonb_build_array(jsonb_build_object('id',person_a,'minutes',2400,'retain',true,'leaving',false,'paid',19400),jsonb_build_object('id',person_b,'minutes',1920,'retain',true,'leaving',false,'paid',null),jsonb_build_object('id',person_c,'minutes',480,'retain',false,'leaving',false,'paid',null)));
  response:=public.personal_tip_command('save_draft',payload,rev);rev:=(response->>'revision')::integer;
  if response->'state'->>'draft' is null then raise exception 'Draft not saved'; end if;
  blocked:=false;begin perform public.personal_tip_command('confirm',payload,rev-1);exception when others then blocked:=true;end;
  if not blocked then raise exception 'Stale revision accepted'; end if;
  response:=public.personal_tip_command('confirm',payload,rev);rev:=(response->>'revision')::integer;
  select sum((x->>'gross')::bigint),sum((x->>'paid')::bigint),sum((x->>'balance')::bigint) into gross_sum,paid_sum,balance_sum from jsonb_array_elements(response->'state'->'weeks'->0->'payments') x;
  if gross_sum<>40000 or paid_sum<>38600 or balance_sum<>2155 then raise exception 'Distribution mismatch % % %',gross_sum,paid_sum,balance_sum;end if;
  blocked:=false;begin perform public.personal_tip_command('confirm',payload,rev);exception when others then blocked:=true;end;
  if not blocked then raise exception 'Duplicate week accepted';end if;
  payload:=jsonb_set(payload,'{week}','"2026-09-28"');payload:=jsonb_set(payload,'{entries,0,paid}','null');
  payload:=jsonb_set(payload,'{entries,2,paid}','1');
  blocked:=false;begin perform public.personal_tip_command('confirm',payload,rev);exception when others then blocked:=true;end;
  if not blocked then raise exception 'Incomplete settlement accepted';end if;
  payload:=jsonb_set(payload,'{entries,2,paid}','null');
  response:=public.personal_tip_command('confirm',payload,rev);rev:=(response->>'revision')::integer;final_state:=response->'state';
  select sum((x->>'balance')::bigint) into balance_sum from jsonb_array_elements(final_state->'staff') x;
  if balance_sum<>0 or (final_state->'weeks'->1->>'close')::boolean is not true then raise exception 'Month-end not settled';end if;
  payload:=jsonb_set(payload,'{week}','"2026-10-05"');payload:=jsonb_set(payload,'{entries,0,leaving}','true');
  response:=public.personal_tip_command('confirm',payload,rev);rev:=(response->>'revision')::integer;
  if (response->'state'->'staff'->0->>'active')::boolean then raise exception 'Departure not inactivated';end if;
  -- Every recorded cent is either delivered or remains as a balance, including opening reserves.
  select sum((p->>'gross')::bigint),sum((p->>'paid')::bigint) into gross_sum,paid_sum from jsonb_array_elements(response->'state'->'weeks') w cross join lateral jsonb_array_elements(w->'payments') p;
  select sum((x->>'balance')::bigint) into balance_sum from jsonb_array_elements(response->'state'->'staff') x;
  if 755+gross_sum<>paid_sum+balance_sum then raise exception 'Ledger does not reconcile';end if;
  perform set_config('request.jwt.claim.sub','',true);
  blocked:=false;begin perform public.personal_tip_command('add_staff','{"name":"BAD","opening":0}',rev);exception when others then blocked:=true;end;
  if not blocked then raise exception 'Unauthenticated command accepted';end if;
end $$;
rollback;
select 'PASS: atomic draft/confirm, exact balances, stale revisions, duplicates, month-end, departure, reconciliation and unauthenticated denial; all test writes rolled back' as result;
