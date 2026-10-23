-- The dispatcher rechecks shift status before sending a notification.
-- Grant only the columns used by that server-side check; no notes or financial data.
grant select(id,day_type,end_time,paused_at,duration_minutes,updated_at)
 on public.personal_work_hours to service_role;
