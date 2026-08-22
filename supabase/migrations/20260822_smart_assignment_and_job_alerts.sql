-- v1.1 smart assignment notifications and single-delivery job alerts
-- This migration has already been applied to the live Supabase project.

create table if not exists public.job_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  alert_type text not null check (alert_type in ('upcoming','overdue')),
  created_at timestamptz not null default now(),
  unique(job_id, user_id, alert_type)
);

-- Live project also contains updated private.sync_customer_and_notify_job()
-- and public.generate_job_alerts() functions.
