-- Applied to production Supabase project on 2026-08-21.
-- Adds profile email, restricts browser profile updates, and keeps the existing
-- private job event trigger as the single notification/history source.
alter table public.profiles add column if not exists email text;
update public.profiles p set email = u.email from auth.users u where p.id = u.id and p.email is null;
create unique index if not exists profiles_email_unique on public.profiles (lower(email)) where email is not null;
revoke update on table public.profiles from authenticated;
grant update (full_name, phone) on table public.profiles to authenticated;

drop trigger if exists jobs_notify_service on public.jobs;
drop trigger if exists jobs_status_change on public.jobs;
drop trigger if exists trg_notify_job_insert on public.jobs;
drop trigger if exists trg_notify_job_status_change on public.jobs;
