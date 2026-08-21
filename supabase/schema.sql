-- İş Takip v0.2 - Supabase schema
create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'ofis' check (role in ('yonetici','ofis','servis')),
  department text not null default 'ofis' check (department in ('ofis','servis')),
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  scheduled_at timestamptz not null,
  customer_name text not null,
  customer_phone text not null,
  description text not null,
  status text not null default 'bekliyor' check (status in ('bekliyor','islemde','tamamlandi','ertelendi')),
  assigned_department text not null default 'servis' check (assigned_department in ('ofis','servis')),
  created_by uuid not null references public.profiles(id),
  created_by_name text not null,
  completed_at timestamptz,
  postponed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_history (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null,
  old_status text,
  new_status text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists jobs_created_by_idx on public.jobs(created_by);
create index if not exists jobs_scheduled_at_idx on public.jobs(scheduled_at);
create index if not exists jobs_status_idx on public.jobs(status);
create index if not exists notifications_recipient_idx on public.notifications(recipient_id, is_read, created_at desc);
create index if not exists history_job_idx on public.job_history(job_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.job_history enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "profiles_read_team" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "jobs_read_team" on public.jobs;
drop policy if exists "jobs_create_team" on public.jobs;
drop policy if exists "jobs_create_office_manager" on public.jobs;
drop policy if exists "jobs_update_team" on public.jobs;
drop policy if exists "history_read_team" on public.job_history;
drop policy if exists "history_create_team" on public.job_history;
drop policy if exists "notifications_read_own" on public.notifications;
drop policy if exists "notifications_update_own" on public.notifications;

create policy "profiles_read_team" on public.profiles for select to authenticated using (true);
create policy "profiles_update_self" on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "jobs_read_team" on public.jobs for select to authenticated using (true);
create policy "jobs_create_office_manager" on public.jobs for insert to authenticated
with check (
  (select auth.uid()) = created_by and exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('ofis','yonetici')
  )
);
create policy "jobs_update_team" on public.jobs for update to authenticated
using (
  created_by = (select auth.uid()) or exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('servis','yonetici')
  )
)
with check (
  created_by = (select auth.uid()) or exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('servis','yonetici')
  )
);

create policy "history_read_team" on public.job_history for select to authenticated using (true);
create policy "notifications_read_own" on public.notifications for select to authenticated using ((select auth.uid()) = recipient_id);
create policy "notifications_update_own" on public.notifications for update to authenticated
using ((select auth.uid()) = recipient_id) with check ((select auth.uid()) = recipient_id);

grant usage on schema public to authenticated;
revoke update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update(full_name) on public.profiles to authenticated;
grant select, insert, update on public.jobs to authenticated;
grant select on public.job_history to authenticated;
grant select, update on public.notifications to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- New auth users automatically get a safe default profile. Role is NOT taken from user metadata.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, role, department)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'full_name',''), split_part(new.email,'@',1)), 'ofis', 'ofis')
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

-- Backfill profiles if Auth users existed before this schema was installed.
insert into public.profiles (id, full_name, role, department)
select id, coalesce(nullif(raw_user_meta_data ->> 'full_name',''), split_part(email,'@',1)), 'ofis', 'ofis'
from auth.users
on conflict (id) do nothing;

create or replace function private.set_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
revoke all on function private.set_updated_at() from public, anon, authenticated;

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at before update on public.jobs for each row execute function private.set_updated_at();

-- Creates audit history and notification fan-out. Kept outside public schema and not directly executable by app roles.
create or replace function private.handle_job_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  service_user record;
begin
  if tg_op = 'INSERT' then
    insert into public.job_history(job_id, actor_id, action, new_status)
    values (new.id, new.created_by, 'olusturuldu', new.status);

    for service_user in select id from public.profiles where department = 'servis' or role in ('servis','yonetici') loop
      if service_user.id <> new.created_by then
        insert into public.notifications(recipient_id, job_id, message)
        values (service_user.id, new.id, new.customer_name || ' için yeni servis işi eklendi.');
      end if;
    end loop;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status is distinct from new.status or old.scheduled_at is distinct from new.scheduled_at then
      insert into public.job_history(job_id, actor_id, action, old_status, new_status, note)
      values (
        new.id,
        actor,
        case when new.status = 'tamamlandi' then 'tamamlandi' when new.status = 'ertelendi' then 'ertelendi' else 'durum_degisti' end,
        old.status,
        new.status,
        case when old.scheduled_at is distinct from new.scheduled_at then 'Yeni tarih: ' || to_char(new.scheduled_at at time zone 'Europe/Istanbul','DD.MM.YYYY HH24:MI') else null end
      );
    end if;

    if new.status = 'tamamlandi' and old.status is distinct from 'tamamlandi' and new.created_by <> actor then
      insert into public.notifications(recipient_id, job_id, message)
      values (new.created_by, new.id, new.customer_name || ' işi servis tarafından tamamlandı.');
    elsif new.status = 'ertelendi' and (old.status is distinct from 'ertelendi' or old.scheduled_at is distinct from new.scheduled_at) and new.created_by <> actor then
      insert into public.notifications(recipient_id, job_id, message)
      values (new.created_by, new.id, new.customer_name || ' işi ertelendi. Yeni tarih: ' || to_char(new.scheduled_at at time zone 'Europe/Istanbul','DD.MM.YYYY HH24:MI'));
    end if;
    return new;
  end if;
  return coalesce(new, old);
end $$;
revoke all on function private.handle_job_event() from public, anon, authenticated;

drop trigger if exists job_event_trigger on public.jobs;
create trigger job_event_trigger after insert or update on public.jobs for each row execute function private.handle_job_event();

-- Realtime: add jobs and notifications once if they are not already published.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='jobs') then
    alter publication supabase_realtime add table public.jobs;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- After creating accounts, set service/manager roles in SQL Editor as needed, for example:
-- update public.profiles set role='servis', department='servis' where id='<USER_UUID>';
-- update public.profiles set role='yonetici', department='ofis' where id='<USER_UUID>';
