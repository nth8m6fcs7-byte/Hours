-- Push resources belong exclusively to HOURS; do not reuse other apps' subscriptions.
create table public.hours_push_config (
 id boolean primary key default true check(id), public_key text not null,
 private_key text not null, cron_token uuid not null default gen_random_uuid()
);
alter table public.hours_push_config enable row level security;
revoke all on public.hours_push_config from anon,authenticated;
grant all on public.hours_push_config to service_role;
create table public.hours_push_subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique check(length(endpoint)<2048), p256dh text not null check(length(p256dh)<256),
 auth text not null check(length(auth)<128), time_zone text not null check(length(time_zone)<100),
 created_at timestamptz not null default now()
);
alter table public.hours_push_subscriptions enable row level security;
revoke all on public.hours_push_subscriptions from anon;
grant select,insert,update,delete on public.hours_push_subscriptions to authenticated;
grant all on public.hours_push_subscriptions to service_role;
create policy hours_push_owner on public.hours_push_subscriptions to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create index hours_push_subscriptions_user on public.hours_push_subscriptions(user_id);
create table public.hours_push_deliveries (
 shift_id uuid not null references public.personal_work_hours(id) on delete cascade,
 subscription_id uuid not null references public.hours_push_subscriptions(id) on delete cascade,
 delivered_at timestamptz, next_attempt timestamptz not null default now(), attempts integer not null default 0,
 primary key(shift_id,subscription_id)
);
alter table public.hours_push_deliveries enable row level security;
revoke all on public.hours_push_deliveries from anon,authenticated;
grant all on public.hours_push_deliveries to service_role;
create function public.hours_claim_push() returns table(shift_id uuid,subscription_id uuid,endpoint text,p256dh text,auth text)
 language plpgsql security definer set search_path='' as $$
begin
 insert into public.hours_push_deliveries(shift_id,subscription_id)
 select w.id,s.id from public.personal_work_hours w join public.hours_push_subscriptions s on s.user_id=w.user_id
 join pg_catalog.pg_timezone_names tz on tz.name=s.time_zone
 where w.day_type='work' and w.start_time is not null and w.end_time is null
 and w.duration_minutes is null and w.paused_at is null
 and ((w.work_date+w.start_time) at time zone s.time_zone)>=now()-interval '48 hours'
 and now()>=((w.work_date+w.start_time) at time zone s.time_zone)+interval '8 hours'+make_interval(secs=>w.break_seconds)
 on conflict do nothing;
 return query
 with candidates as (
 select d.shift_id,d.subscription_id from public.hours_push_deliveries d
 join public.personal_work_hours w on w.id=d.shift_id
 join public.hours_push_subscriptions s on s.id=d.subscription_id
 join pg_catalog.pg_timezone_names tz on tz.name=s.time_zone
 where d.delivered_at is null and d.next_attempt<=now() and d.attempts<5
 and w.day_type='work' and w.end_time is null and w.start_time is not null
 and w.duration_minutes is null and w.paused_at is null
 and ((w.work_date+w.start_time) at time zone s.time_zone)>=now()-interval '48 hours'
 and now()>=((w.work_date+w.start_time) at time zone s.time_zone)+interval '8 hours'+make_interval(secs=>w.break_seconds)
 order by d.next_attempt limit 5 for update of d skip locked
 ), claimed as (
 update public.hours_push_deliveries d set attempts=d.attempts+1,next_attempt=now()+interval '2 minutes'
 from candidates c where d.shift_id=c.shift_id and d.subscription_id=c.subscription_id returning d.shift_id,d.subscription_id
 ) select c.shift_id,c.subscription_id,s.endpoint,s.p256dh,s.auth from claimed c
 join public.hours_push_subscriptions s on s.id=c.subscription_id;
end; $$;
revoke all on function public.hours_claim_push() from public,anon,authenticated;
grant execute on function public.hours_claim_push() to service_role;
create function public.hours_validate_push_timezone() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.time_zone) then
  raise exception 'Invalid time zone';
 end if;
 return new;
end; $$;
revoke all on function public.hours_validate_push_timezone() from public,anon,authenticated;
create trigger hours_validate_push_timezone before insert or update on public.hours_push_subscriptions
 for each row execute function public.hours_validate_push_timezone();
