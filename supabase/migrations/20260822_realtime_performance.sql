do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'job_attachments'
  ) then
    alter publication supabase_realtime add table public.job_attachments;
  end if;
end $$;

alter table public.jobs replica identity full;
alter table public.notifications replica identity full;
alter table public.job_attachments replica identity full;
