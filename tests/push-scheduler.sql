begin;
create temporary table personal_work_hours(like public.personal_work_hours including defaults including constraints) on commit drop;
create temporary table hours_push_subscriptions(like public.hours_push_subscriptions including defaults including constraints) on commit drop;
create temporary table hours_push_deliveries(like public.hours_push_deliveries including defaults including constraints including indexes) on commit drop;
create function pg_temp.hours_claim_push() returns table(shift_id uuid,subscription_id uuid,endpoint text,p256dh text,auth text)
 language plpgsql security definer set search_path='' as $$
begin
 insert into pg_temp.hours_push_deliveries(shift_id,subscription_id)
 select w.id,s.id from pg_temp.personal_work_hours w join pg_temp.hours_push_subscriptions s on s.user_id=w.user_id
 join pg_catalog.pg_timezone_names tz on tz.name=s.time_zone
 where w.day_type='work' and w.start_time is not null and w.end_time is null
 and w.duration_minutes is null and w.paused_at is null
 and ((w.work_date+w.start_time) at time zone s.time_zone)>=now()-interval '48 hours'
 and now()>=((w.work_date+w.start_time) at time zone s.time_zone)+interval '8 hours'+make_interval(secs=>w.break_seconds)
 on conflict do nothing;
 return query
 with candidates as (
 select d.shift_id,d.subscription_id from pg_temp.hours_push_deliveries d
 join pg_temp.personal_work_hours w on w.id=d.shift_id
 join pg_temp.hours_push_subscriptions s on s.id=d.subscription_id
 join pg_catalog.pg_timezone_names tz on tz.name=s.time_zone
 where d.delivered_at is null and d.next_attempt<=now() and d.attempts<5
 and w.day_type='work' and w.end_time is null and w.start_time is not null
 and w.duration_minutes is null and w.paused_at is null
 and ((w.work_date+w.start_time) at time zone s.time_zone)>=now()-interval '48 hours'
 and now()>=((w.work_date+w.start_time) at time zone s.time_zone)+interval '8 hours'+make_interval(secs=>w.break_seconds)
 order by d.next_attempt limit 5 for update of d skip locked
 ), claimed as (
 update pg_temp.hours_push_deliveries d set attempts=d.attempts+1,next_attempt=now()+interval '2 minutes'
 from candidates c where d.shift_id=c.shift_id and d.subscription_id=c.subscription_id returning d.shift_id,d.subscription_id
 ) select c.shift_id,c.subscription_id,s.endpoint,s.p256dh,s.auth from claimed c
 join pg_temp.hours_push_subscriptions s on s.id=c.subscription_id;
end; $$;

insert into pg_temp.hours_push_subscriptions(id,user_id,endpoint,p256dh,auth,time_zone) values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010','https://fcm.googleapis.com/test','key','auth','UTC');
insert into pg_temp.personal_work_hours(id,user_id,work_date,start_time,end_time,break_seconds,paused_at,day_type)
select ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000010',
((now() at time zone 'UTC')-interval '8 hours 1 minute')::date,
((now() at time zone 'UTC')-interval '8 hours 1 minute')::time,
case when i=4 then time '23:59' else null end,
case when i=3 then 120 else 0 end,
case when i=2 then now() else null end,'work' from generate_series(1,4) i;
do $$declare n int;begin
 select count(*) into n from pg_temp.hours_claim_push();if n<>1 then raise exception 'Expected exactly one eligible shift, got %',n;end if;
 select count(*) into n from pg_temp.hours_claim_push();if n<>0 then raise exception 'Concurrent claim duplicated';end if;
 update pg_temp.hours_push_deliveries set delivered_at=now(),next_attempt=now()-interval '1 minute';
 select count(*) into n from pg_temp.hours_claim_push();if n<>0 then raise exception 'Delivered shift repeated';end if;
end$$;
select 'passed: pauses, completed shifts, net duration, lease and deduplication' as result;
rollback;
