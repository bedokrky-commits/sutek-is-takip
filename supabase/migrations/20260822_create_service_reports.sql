-- v1.3 digital service form
-- Already applied to the live Supabase project.
create table if not exists public.service_reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  work_performed text not null default '',
  parts_used text,
  internal_note text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
