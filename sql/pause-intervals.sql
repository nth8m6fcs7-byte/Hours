-- Additive storage for exact completed pause intervals. Existing totals are preserved.
alter table public.personal_work_hours
  add column if not exists pause_intervals jsonb not null default '[]'::jsonb
    check (jsonb_typeof(pause_intervals) = 'array');
comment on column public.personal_work_hours.pause_intervals is
  'Completed pause intervals as start/end ISO timestamps; older untracked pause seconds remain in break_seconds.';
