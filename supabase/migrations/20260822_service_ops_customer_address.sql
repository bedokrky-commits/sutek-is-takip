-- v1.2 live migration already applied
alter table public.jobs add column if not exists customer_address text;
