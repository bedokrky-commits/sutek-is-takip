-- v2.0 live service status
-- Applied to live Supabase project.
create table if not exists public.service_live_status (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'available' check (status in ('available','en_route','on_site')),
  job_id uuid null references public.jobs(id) on delete set null,
  updated_at timestamptz not null default now()
);
-- Includes RLS, set_my_service_status RPC, realtime publication,
-- automatic available reset on job completion/reassignment,
-- and automatic job -> in_progress when service marks on_site.
