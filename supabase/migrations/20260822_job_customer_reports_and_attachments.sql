-- v0.8 live migration already applied via Supabase
alter table public.jobs add column if not exists customer_report text;
alter table public.jobs add column if not exists report_updated_at timestamptz;
alter table public.jobs add column if not exists report_updated_by uuid references public.profiles(id) on delete set null;

create table if not exists public.job_attachments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  file_size bigint,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
