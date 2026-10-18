-- Additive HOURS document import. PPR redemptions are movements, never income.
alter table public.hours_finance_months
 add column ppr_redemption_cents integer check(ppr_redemption_cents between 0 and 99999999),
 add column ppr_origin_month date check(extract(day from ppr_origin_month)=1);
create table public.hours_finance_documents(
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 kind text not null check(kind in ('payroll','coverflex')),
 filename text not null check(length(filename) between 1 and 255),
 object_path text not null check(split_part(object_path,'/',1)=user_id::text),
 income_month date not null check(extract(day from income_month)=1),
 movement_month date check(extract(day from movement_month)=1),
 status text not null default 'draft' check(status in ('draft','confirmed')),
 reviewed_values jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(user_id,sha256)
);
alter table public.hours_finance_documents enable row level security;
create policy hours_finance_documents_owner on public.hours_finance_documents for all to authenticated
 using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
grant select,insert,update,delete on public.hours_finance_documents to authenticated;
revoke all on public.hours_finance_documents from anon;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('hours-receipts','hours-receipts',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']);
create policy hours_receipts_owner on storage.objects for all to authenticated
 using(bucket_id='hours-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text)
 with check(bucket_id='hours-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Guard the new bucket even if another app has a broad permissive storage policy.
create policy hours_receipts_isolation on storage.objects as restrictive for all to public
 using(bucket_id<>'hours-receipts' or (storage.foldername(name))[1]=(select auth.uid())::text)
 with check(bucket_id<>'hours-receipts' or (storage.foldername(name))[1]=(select auth.uid())::text);
create function public.hours_confirm_finance_document(p_id uuid,p_income_month date,p_movement_month date,p_origin_month date,p_values jsonb,p_received boolean)
 returns void language plpgsql security invoker set search_path=''
 as $$
declare
 owner_id uuid := auth.uid(); doc public.hours_finance_documents%rowtype;
 item record; new_entries jsonb; replacements text[] := array[]::text[]; category_name text; destination_name text; amount integer;
begin
 if owner_id is null then raise exception 'É necessário entrar na conta.'; end if;
 if p_received is null or p_income_month is null or extract(day from p_income_month)<>1 or p_income_month not between date '1900-01-01' and date '2100-12-01' then raise exception 'Mês inválido.'; end if;
 if p_movement_month is not null and (extract(day from p_movement_month)<>1 or p_movement_month not between date '1900-01-01' and date '2100-12-01') then raise exception 'Mês do resgate inválido.'; end if;
 if p_origin_month is not null and (extract(day from p_origin_month)<>1 or p_origin_month not between date '1900-01-01' and date '2100-12-01') then raise exception 'Mês do prémio inválido.'; end if;
 if p_origin_month is not null and p_movement_month is not null and p_origin_month>p_movement_month then raise exception 'O prémio não pode ser posterior ao resgate.'; end if;
 if p_values is null or jsonb_typeof(p_values)<>'object' then raise exception 'Valores inválidos.'; end if;
 for item in select key,value from jsonb_each(p_values) loop
  if item.key not in ('salary','food','bonus','ppr','gross','irs','ss','net') or jsonb_typeof(item.value)<>'number' or item.value::text !~ '^[0-9]{1,8}$' then raise exception 'Valor inválido: %',item.key; end if;
 end loop;
 select * into doc from public.hours_finance_documents where id=p_id and user_id=owner_id for update;
 if not found then raise exception 'Documento indisponível.'; end if;
 if doc.status='confirmed' then raise exception 'Este documento já foi confirmado.'; end if;
 if not (p_values ?| array['salary','food','bonus','ppr']) then raise exception 'Indica pelo menos um valor a importar.'; end if;
 if p_values ? 'ppr' and p_movement_month is null then raise exception 'Indica o mês do resgate.'; end if;
 -- Lock a single monthly record; replace recognised categories instead of adding a
 -- second copy when the same credit is shown on payroll and on Coverflex.
 insert into public.hours_finance_months(user_id,month) values(owner_id,p_income_month) on conflict(user_id,month) do nothing;
 select entries into new_entries from public.hours_finance_months where user_id=owner_id and month=p_income_month for update;
 for item in select key,value from jsonb_each(p_values) where key in ('salary','food','bonus') loop
  category_name:=case item.key when 'salary' then 'salary' when 'food' then 'food' else 'coverflex' end;
  destination_name:=case item.key when 'salary' then 'bank' when 'food' then 'meal_card' else 'coverflex' end;
  replacements:=array_append(replacements,category_name);
 end loop;
 select coalesce(jsonb_agg(value),'[]'::jsonb) into new_entries from jsonb_array_elements(new_entries) where not(value->>'category'=any(replacements));
 for item in select key,value from jsonb_each(p_values) where key in ('salary','food','bonus') loop
  category_name:=case item.key when 'salary' then 'salary' when 'food' then 'food' else 'coverflex' end;
  destination_name:=case item.key when 'salary' then 'bank' when 'food' then 'meal_card' else 'coverflex' end;
  amount:=(item.value::text)::integer;
  new_entries:=new_entries||jsonb_build_array(jsonb_build_object('category',category_name,'destination',destination_name,'expected_cents',amount,'received_cents',case when p_received then amount else null end));
 end loop;
 update public.hours_finance_months set entries=new_entries,updated_at=now() where user_id=owner_id and month=p_income_month;
 if p_values ? 'ppr' then
  -- A monthly total is replaced, never added to a previous import.
  insert into public.hours_finance_months(user_id,month,ppr_redemption_cents,ppr_origin_month)
   values(owner_id,p_movement_month,(p_values->>'ppr')::integer,p_origin_month)
   on conflict(user_id,month) do update set ppr_redemption_cents=excluded.ppr_redemption_cents,ppr_origin_month=excluded.ppr_origin_month,updated_at=now();
 end if;
 update public.hours_finance_documents set income_month=p_income_month,movement_month=p_movement_month,status='confirmed',reviewed_values=p_values where id=p_id and user_id=owner_id;
end $$;
revoke execute on function public.hours_confirm_finance_document(uuid,date,date,date,jsonb,boolean) from public,anon;
grant execute on function public.hours_confirm_finance_document(uuid,date,date,date,jsonb,boolean) to authenticated;
