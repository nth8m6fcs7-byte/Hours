alter table public.personal_work_hours add column if not exists work_adjustment_seconds integer not null default 0 check (work_adjustment_seconds between -172800 and 172800);
comment on column public.personal_work_hours.work_adjustment_seconds is 'Signed correction to worked time in seconds, separate from pauses.';
create or replace function public.hours_claim_push() returns table(shift_id uuid,subscription_id uuid,endpoint text,p256dh text,auth text)
 language plpgsql security definer set search_path='' as $$
begin
 insert into public.hours_push_deliveries(shift_id,subscription_id)
 select w.id,s.id from public.personal_work_hours w join public.hours_push_subscriptions s on s.user_id=w.user_id
 join pg_catalog.pg_timezone_names tz on tz.name=s.time_zone
 where w.day_type='work' and w.start_time is not null and w.end_time is null
 and w.duration_minutes is null and w.paused_at is null
 and ((w.work_date+w.start_time) at time zone s.time_zone)>=now()-interval '48 hours'
 and now()>=((w.work_date+w.start_time) at time zone s.time_zone)+interval '8 hours'+make_interval(secs=>w.break_seconds-w.work_adjustment_seconds)
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
 and now()>=((w.work_date+w.start_time) at time zone s.time_zone)+interval '8 hours'+make_interval(secs=>w.break_seconds-w.work_adjustment_seconds)
 order by d.next_attempt limit 5 for update of d skip locked
 ), claimed as (
 update public.hours_push_deliveries d set attempts=d.attempts+1,next_attempt=now()+interval '2 minutes'
 from candidates c where d.shift_id=c.shift_id and d.subscription_id=c.subscription_id returning d.shift_id,d.subscription_id
 ) select c.shift_id,c.subscription_id,s.endpoint,s.p256dh,s.auth from claimed c
 join public.hours_push_subscriptions s on s.id=c.subscription_id;
end; $$;
