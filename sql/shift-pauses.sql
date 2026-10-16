-- Additive schema required before deploying pause/resume support.
-- No changes to existing rows, ownership, grants or RLS policies.
alter table public.personal_work_hours
  add column if not exists break_seconds integer not null default 0
    check (break_seconds >= 0),
  add column if not exists paused_at timestamptz;
comment on column public.personal_work_hours.break_seconds is
  'Cumulative completed pause seconds; excluded from worked time.';
comment on column public.personal_work_hours.paused_at is
  'Start instant of an ongoing pause, or null while working/after finishing.';
