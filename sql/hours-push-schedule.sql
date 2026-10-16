-- Apply after deploying hours-push and initializing its public GET endpoint.
-- The shared scheduler token is read inside Postgres, never embedded in source.
select cron.schedule('hours-eight-hour-push','* * * * *', $job$
 select net.http_post(
  url := 'https://ecxbujytmufnkevddohv.supabase.co/functions/v1/hours-push',
  headers := jsonb_build_object('Content-Type','application/json','x-hours-cron',
    (select cron_token::text from public.hours_push_config where id=true)),
  body := '{}'::jsonb,timeout_milliseconds := 60000)
 where exists(select 1 from public.hours_push_config where id=true);
$job$);
