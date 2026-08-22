-- v1.4 live migration already applied to Supabase.
create sequence if not exists public.service_no_seq start 1;
alter table public.jobs add column if not exists service_no text;
alter table public.jobs add column if not exists repeat_months integer;
alter table public.jobs add column if not exists next_maintenance_at timestamptz;
alter table public.jobs add column if not exists signature_path text;
alter table public.jobs add column if not exists signature_name text;
alter table public.jobs add column if not exists signed_at timestamptz;

create table if not exists public.job_comments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);
-- Full trigger/RLS/function definitions are already active in production Supabase.
grant select, insert, delete on table public.job_comments to authenticated;
