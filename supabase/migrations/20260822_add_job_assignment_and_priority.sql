alter table public.jobs add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table public.jobs add column if not exists priority text not null default 'normal';
alter table public.jobs drop constraint if exists jobs_priority_check;
alter table public.jobs add constraint jobs_priority_check check (priority in ('normal','urgent'));
create index if not exists jobs_assigned_to_idx on public.jobs(assigned_to);
create index if not exists jobs_priority_idx on public.jobs(priority);
