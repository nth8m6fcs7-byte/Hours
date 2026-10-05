-- Optional recorded durations preserve breaks and additional work from imports.
-- Existing records, ownership policies, and authentication settings are unchanged.
alter table public.personal_work_hours
  add column if not exists duration_minutes integer,
  add column if not exists notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'personal_work_hours_duration_minutes_valid'
      and conrelid = 'public.personal_work_hours'::regclass
  ) then
    alter table public.personal_work_hours
      add constraint personal_work_hours_duration_minutes_valid
      check (duration_minutes is null or duration_minutes between 0 and 1440);
  end if;
end $$;

comment on column public.personal_work_hours.duration_minutes is
  'Optional recorded work duration in minutes, including breaks or extra work. Null uses start_time/end_time.';
comment on column public.personal_work_hours.notes is
  'Optional notes supplied with the work-hour record.';
