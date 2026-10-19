-- Weekly personal tips are income entries in the month of the closing Sunday.
-- Invoker permissions and existing monthly owner RLS protect every read/write.
create or replace function public.hours_save_weekly_tips(p_week_start date,p_amount integer,p_replace_manual boolean default false)
returns void language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid(); target_month date; items jsonb;
begin
 if owner_id is null then raise exception 'Entra na tua conta.'; end if;
 if p_week_start is null or extract(isodow from p_week_start)<>1 or p_week_start not between date '1900-01-01' and date '2100-12-24' or p_amount is null or p_amount<0 or p_amount>99999999 then raise exception 'Semana ou valor inválido.'; end if;
 target_month:=date_trunc('month',p_week_start+6)::date;
 insert into public.hours_finance_months(user_id,month) values(owner_id,target_month) on conflict do nothing;
 select entries into items from public.hours_finance_months where user_id=owner_id and month=target_month for update;
 if not coalesce(p_replace_manual,false) and exists(select 1 from jsonb_array_elements(items) e where e->>'category'='tips' and not(e ? 'week_start') and (coalesce((e->>'received_cents')::integer,0)>0 or coalesce((e->>'expected_cents')::integer,0)>0)) then raise exception 'Já existem gorjetas mensais. Confirma a substituição pelo registo semanal.'; end if;
 select coalesce(jsonb_agg(e),'[]'::jsonb) into items from jsonb_array_elements(items) e where not(e->>'category'='tips' and (e->>'week_start'=p_week_start::text or not(e ? 'week_start')));
 items:=items||jsonb_build_array(jsonb_build_object('category','tips','destination','cash','expected_cents',p_amount,'received_cents',p_amount,'week_start',p_week_start));
 update public.hours_finance_months set entries=items,updated_at=now() where user_id=owner_id and month=target_month;
end $$;
revoke all on function public.hours_save_weekly_tips(date,integer,boolean) from public,anon;
grant execute on function public.hours_save_weekly_tips(date,integer,boolean) to authenticated;
