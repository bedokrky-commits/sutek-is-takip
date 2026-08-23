-- v2.1 service time tracking
create table if not exists public.service_time_logs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  en_route_at timestamptz,
  on_site_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id,user_id)
);

alter table public.service_time_logs enable row level security;

drop policy if exists service_time_logs_read on public.service_time_logs;
create policy service_time_logs_read on public.service_time_logs
for select to authenticated
using (
  user_id = auth.uid()
  or public.current_user_role() in ('admin'::public.user_role,'office'::public.user_role)
);

create or replace function private.touch_service_time_log()
returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end; $$;

drop trigger if exists service_time_logs_touch on public.service_time_logs;
create trigger service_time_logs_touch before update on public.service_time_logs
for each row execute function private.touch_service_time_log();

-- The live set_my_service_status RPC was also extended to write en_route_at/on_site_at,
-- and jobs completion trigger now writes completed_at.
