-- Personal Hours ledger. Existing Bacalhau tip tables and work hours are untouched.
create schema if not exists hours_private;
revoke all on schema hours_private from public, anon;
grant usage on schema hours_private to authenticated;
create table public.personal_tip_ledgers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision integer not null default 0 check (revision>=0),
  state jsonb not null default '{"staff":[],"weeks":[],"draft":null}',
  updated_at timestamptz not null default now()
);
alter table public.personal_tip_ledgers enable row level security;
revoke all on public.personal_tip_ledgers from public,anon,authenticated;
grant select on public.personal_tip_ledgers to authenticated;
create policy personal_tip_ledger_read on public.personal_tip_ledgers for select to authenticated
using ((select auth.uid())=user_id);

-- Privileged writes are necessary: clients cannot directly replace balances/history.
-- Kept in a non-exposed schema, fixed search_path, ownership from auth.uid(), no owner argument.
create function hours_private.tip_command(p_action text,p_payload jsonb,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  owner_id uuid:=auth.uid(); ledger public.personal_tip_ledgers; doc jsonb; people jsonb; person jsonb;
  entry jsonb; draft jsonb; result jsonb:='[]'; updated_people jsonb:='[]'; snapshots jsonb;
  staff_id text; staff_name text; week_date date; last_date date; daily bigint:=0; total bigint;
  mins bigint:=0; hours_i integer; cents bigint; before_i bigint; gross_i bigint; paid_i bigint;
  suggested bigint; balance_i bigint; is_close boolean; leaving_i boolean; retain_i boolean;
  n integer; extra_cents integer; item record; new_revision integer;
begin
  if owner_id is null then raise exception 'Inicia sessão para gerir gorjetas.'; end if;
  if p_revision is null or p_action is null or p_payload is null then raise exception 'Pedido incompleto.'; end if;
  insert into public.personal_tip_ledgers(user_id) values(owner_id) on conflict do nothing;
  select * into ledger from public.personal_tip_ledgers where user_id=owner_id for update;
  if ledger.revision<>p_revision then raise exception 'Os dados mudaram noutro dispositivo. Atualiza antes de continuar.'; end if;
  doc:=ledger.state; people:=doc->'staff';
  if p_action='add_staff' then
    staff_name:=btrim(p_payload->>'name'); cents:=(p_payload->>'opening')::bigint;
    if staff_name is null or length(staff_name) not between 1 and 80 or cents is null or cents not between 0 and 100000000 then raise exception 'Nome ou saldo inicial inválido.'; end if;
    if jsonb_array_length(people)>=150 then raise exception 'Limite de pessoas atingido.'; end if;
    if exists(select 1 from jsonb_array_elements(people) x where lower(x->>'name')=lower(staff_name) and (x->>'active')::boolean) then raise exception 'Já existe uma pessoa ativa com esse nome.'; end if;
    if cents>0 and length(btrim(coalesce(p_payload->>'opening_note','')))=0 then raise exception 'Indica a origem do saldo inicial.'; end if;
    if length(coalesce(p_payload->>'opening_note',''))>200 then raise exception 'Nota demasiado longa.'; end if;
    person:=jsonb_build_object('id',gen_random_uuid()::text,'name',staff_name,'balance',cents,'opening',cents,'opening_note',coalesce(p_payload->>'opening_note',''),'created_at',now(),'active',true,'retain',coalesce((p_payload->>'retain')::boolean,true),'linked',coalesce((p_payload->>'linked')::boolean,false));
    if (person->>'linked')::boolean and exists(select 1 from jsonb_array_elements(people) x where (x->>'linked')::boolean and (x->>'active')::boolean) then raise exception 'Só uma pessoa pode usar as tuas horas.'; end if;
    people:=people||jsonb_build_array(person);
    doc:=jsonb_set(doc,'{staff}',people);
    if doc->>'draft' is not null then doc:=jsonb_set(doc,'{draft,entries}',(doc->'draft'->'entries')||jsonb_build_array(jsonb_build_object('id',person->>'id','minutes',0,'paid',null,'retain',(person->>'retain')::boolean,'leaving',false))); end if;
  elsif p_action='edit_staff' then
    staff_id:=p_payload->>'id'; staff_name:=btrim(p_payload->>'name');
    if staff_name is null or length(staff_name) not between 1 and 80 then raise exception 'Nome inválido.'; end if;
    if not exists(select 1 from jsonb_array_elements(people) x where x->>'id'=staff_id and (x->>'active')::boolean) then raise exception 'Pessoa inexistente ou inativa.'; end if;
    if exists(select 1 from jsonb_array_elements(people) x where x->>'id'<>staff_id and lower(x->>'name')=lower(staff_name) and (x->>'active')::boolean) then raise exception 'Nome já utilizado.'; end if;
    if coalesce((p_payload->>'linked')::boolean,false) and exists(select 1 from jsonb_array_elements(people) x where x->>'id'<>staff_id and (x->>'linked')::boolean and (x->>'active')::boolean) then raise exception 'Só uma pessoa pode usar as tuas horas.'; end if;
    select jsonb_agg(case when x->>'id'=staff_id then x||jsonb_build_object('name',staff_name,'retain',coalesce((p_payload->>'retain')::boolean,true),'linked',coalesce((p_payload->>'linked')::boolean,false)) else x end order by ord) into people from jsonb_array_elements(people) with ordinality t(x,ord);
    doc:=jsonb_set(doc,'{staff}',people);
  elsif p_action in ('save_draft','confirm') then
    draft:=p_payload; week_date:=(draft->>'week')::date;
    if week_date is null or extract(isodow from week_date)<>1 then raise exception 'A semana deve começar à segunda-feira.'; end if;
    select max((x->>'week')::date) into last_date from jsonb_array_elements(doc->'weeks') x;
    if last_date is not null and week_date<>last_date+7 then raise exception 'Continua pela semana seguinte ao último pagamento confirmado.'; end if;
    is_close:=date_trunc('month',week_date)<>date_trunc('month',week_date+7);
    if jsonb_typeof(draft->'days') is distinct from 'array' or jsonb_array_length(draft->'days')<>7 or jsonb_typeof(draft->'entries') is distinct from 'array' then raise exception 'Dados da semana incompletos.'; end if;
    for entry in select value from jsonb_array_elements(draft->'days') loop
      if entry::text !~ '^\d+$' or entry::text::bigint not between 0 and 100000000 then raise exception 'Gorjeta diária inválida.'; end if;
      daily:=daily+entry::text::bigint;
    end loop;
    if draft->>'counted' is null then total:=daily;
    else
      if draft->>'counted' !~ '^\d+$' then raise exception 'Total contado inválido.'; end if;
      total:=(draft->>'counted')::bigint;
    end if;
    if total not between 0 and 100000000 then raise exception 'Total inválido.'; end if;
    if total<>daily and length(btrim(coalesce(draft->>'note','')))=0 then raise exception 'Explica a diferença entre os emails e o dinheiro contado.'; end if;
    if length(coalesce(draft->>'note',''))>1000 then raise exception 'Nota demasiado longa.'; end if;
    select count(*) into n from jsonb_array_elements(people) x where (x->>'active')::boolean;
    if n=0 or jsonb_array_length(draft->'entries')<>n or (select count(distinct x->>'id') from jsonb_array_elements(draft->'entries') x)<>n then raise exception 'Inclui uma linha por pessoa ativa, sem duplicados.'; end if;
    for entry in select value from jsonb_array_elements(draft->'entries') loop
      if not exists(select 1 from jsonb_array_elements(people) x where x->>'id'=entry->>'id' and (x->>'active')::boolean) then raise exception 'Pessoa inválida.'; end if;
      if entry->>'minutes' is null or entry->>'minutes' !~ '^\d+$' or (entry->>'minutes')::integer not between 0 and 10080 or jsonb_typeof(entry->'retain') is distinct from 'boolean' or jsonb_typeof(entry->'leaving') is distinct from 'boolean' then raise exception 'Horas ou opções inválidas.'; end if;
      mins:=mins+(entry->>'minutes')::integer;
      if entry->>'paid' is not null and (entry->>'paid' !~ '^\d+$' or (entry->>'paid')::bigint>200000000) then raise exception 'Pagamento inválido.'; end if;
    end loop;
    if p_action='save_draft' then
      doc:=jsonb_set(doc,'{draft}',draft);
    else
      if total>0 and mins=0 then raise exception 'Preenche as horas antes de distribuir.'; end if;
      -- Exact integer remainders, deterministic UUID tie-break; never lose cents.
      select (total-coalesce(sum(case when mins=0 then 0 else total*(x->>'minutes')::bigint/mins end),0))::integer into extra_cents from jsonb_array_elements(draft->'entries') x;
      for item in
        select x,case when mins=0 then 0 else total*(x->>'minutes')::bigint/mins end as amount,
          row_number() over(order by case when mins=0 then 0 else mod(total*(x->>'minutes')::bigint,mins) end desc,x->>'id' collate "C") as rank
        from jsonb_array_elements(draft->'entries') x
      loop
        entry:=item.x; staff_id:=entry->>'id';
        select x into person from jsonb_array_elements(people) x where x->>'id'=staff_id;
        before_i:=(person->>'balance')::bigint; gross_i:=item.amount+case when item.rank<=extra_cents then 1 else 0 end;
        leaving_i:=(entry->>'leaving')::boolean; retain_i:=(entry->>'retain')::boolean;
        suggested:=case when is_close or leaving_i or not retain_i then before_i+gross_i else least(before_i+gross_i,((gross_i*95+5000)/10000)*100) end;
        paid_i:=coalesce((entry->>'paid')::bigint,suggested); balance_i:=before_i+gross_i-paid_i;
        if paid_i<0 or balance_i<0 then raise exception '%: pagamento superior ao saldo disponível.',person->>'name'; end if;
        if (is_close or leaving_i or not retain_i) and balance_i<>0 then raise exception '%: liquida o saldo completo.',person->>'name'; end if;
        result:=result||jsonb_build_array(jsonb_build_object('id',staff_id,'name',person->>'name','minutes',(entry->>'minutes')::integer,'retain',retain_i,'leaving',leaving_i,'gross',gross_i,'before',before_i,'paid',paid_i,'balance',balance_i));
      end loop;
      for person in select value from jsonb_array_elements(people) loop
        select x into entry from jsonb_array_elements(result) x where x->>'id'=person->>'id';
        if entry is not null then person:=person||jsonb_build_object('balance',entry->'balance','active',not (entry->>'leaving')::boolean,'retain',entry->'retain'); end if;
        updated_people:=updated_people||jsonb_build_array(person);
      end loop;
      snapshots:=jsonb_build_object('week',week_date,'days',draft->'days','counted',draft->'counted','note',coalesce(draft->>'note',''),'total',total,'daily',daily,'close',is_close,'payments',result,'confirmed_at',now());
      doc:=jsonb_set(jsonb_set(jsonb_set(doc,'{staff}',updated_people),'{weeks}',(doc->'weeks')||jsonb_build_array(snapshots)),'{draft}','null');
    end if;
  else raise exception 'Operação desconhecida.';
  end if;
  update public.personal_tip_ledgers set state=doc,revision=revision+1,updated_at=now() where user_id=owner_id returning revision into new_revision;
  return jsonb_build_object('state',doc,'revision',new_revision);
end $$;
revoke all on function hours_private.tip_command(text,jsonb,integer) from public,anon;
grant execute on function hours_private.tip_command(text,jsonb,integer) to authenticated;
create function public.personal_tip_command(p_action text,p_payload jsonb,p_revision integer)
returns jsonb language sql security invoker set search_path='' as $$
  select hours_private.tip_command(p_action,p_payload,p_revision);
$$;
revoke all on function public.personal_tip_command(text,jsonb,integer) from public,anon;
grant execute on function public.personal_tip_command(text,jsonb,integer) to authenticated;
