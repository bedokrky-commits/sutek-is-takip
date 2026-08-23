-- v1.8 smart notification flow
-- Applied to the live Supabase project.

create or replace function private.sync_customer_and_notify_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  rec record;
  customer_uuid uuid;
  msg_prefix text;
begin
  msg_prefix := coalesce(new.service_no || ' · ', '');

  if tg_op = 'INSERT' then
    select id into customer_uuid
    from public.customers
    where phone = new.customer_phone
    order by created_at asc
    limit 1;

    if customer_uuid is null then
      insert into public.customers(name, phone, created_by)
      values (new.customer_name, new.customer_phone, new.created_by)
      returning id into customer_uuid;
    else
      update public.customers
      set name = new.customer_name, updated_at = now()
      where id = customer_uuid;
    end if;

    update public.jobs set customer_id = customer_uuid where id = new.id;

    insert into public.job_status_history(job_id, old_status, new_status, changed_by, note)
    values (new.id, null, new.status, new.created_by, 'İş oluşturuldu');

    if new.assigned_to is not null then
      if new.assigned_to is distinct from new.created_by then
        insert into public.notifications(user_id, job_id, title, message)
        values (
          new.assigned_to, new.id, 'Yeni görev atandı',
          msg_prefix || new.customer_name || ' işi size atandı. ' ||
          to_char(new.scheduled_at at time zone 'Europe/Istanbul','DD.MM.YYYY HH24:MI')
        );
      end if;
    else
      for rec in
        select id from public.profiles
        where role = 'service' and is_active = true and id is distinct from new.created_by
      loop
        insert into public.notifications(user_id, job_id, title, message)
        values (
          rec.id, new.id, 'Yeni servis işi',
          msg_prefix || new.customer_name || ' için yeni iş eklendi. ' ||
          to_char(new.scheduled_at at time zone 'Europe/Istanbul','DD.MM.YYYY HH24:MI')
        );
      end loop;
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status is distinct from new.status or old.scheduled_at is distinct from new.scheduled_at then
      insert into public.job_status_history(job_id, old_status, new_status, changed_by, note)
      values (
        new.id, old.status, new.status, actor,
        case when old.scheduled_at is distinct from new.scheduled_at
          then 'Yeni tarih: ' || to_char(new.scheduled_at at time zone 'Europe/Istanbul','DD.MM.YYYY HH24:MI')
          else null end
      );
    end if;

    if old.assigned_to is distinct from new.assigned_to then
      if new.assigned_to is not null and new.assigned_to is distinct from actor then
        insert into public.notifications(user_id, job_id, title, message)
        values (
          new.assigned_to, new.id, 'İş size atandı',
          msg_prefix || new.customer_name || ' işi size atandı. ' ||
          to_char(new.scheduled_at at time zone 'Europe/Istanbul','DD.MM.YYYY HH24:MI')
        );
      end if;

      if old.assigned_to is not null and old.assigned_to is distinct from new.assigned_to
         and old.assigned_to is distinct from actor then
        insert into public.notifications(user_id, job_id, title, message)
        values (
          old.assigned_to, new.id, 'Görev ataması değişti',
          msg_prefix || new.customer_name || ' işi artık size atanmamış durumda.'
        );
      end if;
    end if;

    if old.scheduled_at is distinct from new.scheduled_at then
      if new.assigned_to is not null then
        if new.assigned_to is distinct from actor then
          insert into public.notifications(user_id, job_id, title, message)
          values (
            new.assigned_to, new.id, 'İş tarihi güncellendi',
            msg_prefix || new.customer_name || ' için yeni tarih: ' ||
            to_char(new.scheduled_at at time zone 'Europe/Istanbul','DD.MM.YYYY HH24:MI')
          );
        end if;
      else
        for rec in
          select id from public.profiles
          where role = 'service' and is_active = true and id is distinct from actor
        loop
          insert into public.notifications(user_id, job_id, title, message)
          values (
            rec.id, new.id, 'İş tarihi güncellendi',
            msg_prefix || new.customer_name || ' için yeni tarih: ' ||
            to_char(new.scheduled_at at time zone 'Europe/Istanbul','DD.MM.YYYY HH24:MI')
          );
        end loop;
      end if;
    end if;

    if new.status = 'completed' and old.status is distinct from 'completed' then
      for rec in
        select distinct id from public.profiles
        where is_active = true and role in ('admin','office') and id is distinct from actor
      loop
        insert into public.notifications(user_id, job_id, title, message)
        values (rec.id, new.id, 'İş tamamlandı', msg_prefix || new.customer_name || ' işi tamamlandı.');
      end loop;

    elsif new.status = 'postponed' and old.status is distinct from 'postponed' then
      for rec in
        select distinct id from public.profiles
        where is_active = true and role in ('admin','office') and id is distinct from actor
      loop
        insert into public.notifications(user_id, job_id, title, message)
        values (
          rec.id, new.id, 'İş ertelendi',
          msg_prefix || new.customer_name || ' işi ertelendi. Yeni tarih Ofis/Yönetici tarafından belirlenecek.'
        );
      end loop;

      if new.assigned_to is not null and new.assigned_to is distinct from actor then
        insert into public.notifications(user_id, job_id, title, message)
        values (new.assigned_to, new.id, 'İş ertelendi', msg_prefix || new.customer_name || ' işi ertelendi.');
      end if;
    end if;

    return new;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.generate_job_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_active boolean;
  job_rec record;
  rec record;
  inserted_count integer := 0;
  alert_kind text;
  alert_title text;
  alert_message text;
begin
  select is_active into caller_active from public.profiles where id = caller;
  if caller is null or caller_active is distinct from true then
    raise exception 'Yetkisiz kullanıcı';
  end if;

  for job_rec in
    select j.id, j.customer_name, j.scheduled_at, j.assigned_to, j.service_no
    from public.jobs j
    where j.status <> 'completed'
      and j.scheduled_at <= now() + interval '2 hours'
  loop
    if job_rec.scheduled_at < now() then
      alert_kind := 'overdue';
      alert_title := 'Geciken iş';
      alert_message := coalesce(job_rec.service_no || ' · ', '') ||
        job_rec.customer_name || ' işi planlanan saati geçti.';
    else
      alert_kind := 'upcoming';
      alert_title := 'Yaklaşan iş';
      alert_message := coalesce(job_rec.service_no || ' · ', '') ||
        job_rec.customer_name || ' işi 2 saat içinde planlandı.';
    end if;

    if job_rec.assigned_to is not null then
      for rec in
        select id from public.profiles
        where id = job_rec.assigned_to and is_active = true
      loop
        begin
          insert into public.job_alert_deliveries(job_id,user_id,alert_type)
          values(job_rec.id,rec.id,alert_kind);
          insert into public.notifications(user_id,job_id,title,message)
          values(rec.id,job_rec.id,alert_title,alert_message);
          inserted_count := inserted_count + 1;
        exception when unique_violation then null;
        end;
      end loop;
    else
      for rec in
        select id from public.profiles
        where role='service' and is_active=true
      loop
        begin
          insert into public.job_alert_deliveries(job_id,user_id,alert_type)
          values(job_rec.id,rec.id,alert_kind);
          insert into public.notifications(user_id,job_id,title,message)
          values(rec.id,job_rec.id,alert_title,alert_message);
          inserted_count := inserted_count + 1;
        exception when unique_violation then null;
        end;
      end loop;
    end if;

    if alert_kind = 'overdue' then
      for rec in
        select id from public.profiles
        where role in ('admin','office') and is_active=true
      loop
        begin
          insert into public.job_alert_deliveries(job_id,user_id,alert_type)
          values(job_rec.id,rec.id,alert_kind);
          insert into public.notifications(user_id,job_id,title,message)
          values(rec.id,job_rec.id,alert_title,alert_message);
          inserted_count := inserted_count + 1;
        exception when unique_violation then null;
        end;
      end loop;
    end if;
  end loop;

  for job_rec in
    select j.id,j.customer_name,j.next_maintenance_at,j.service_no
    from public.jobs j
    where j.next_maintenance_at is not null
      and j.next_maintenance_at <= now()+interval '7 days'
      and j.next_maintenance_at >= now()-interval '30 days'
  loop
    for rec in
      select id from public.profiles
      where role in ('office','admin') and is_active=true
    loop
      begin
        insert into public.job_alert_deliveries(job_id,user_id,alert_type)
        values(job_rec.id,rec.id,'maintenance');
        insert into public.notifications(user_id,job_id,title,message)
        values(
          rec.id, job_rec.id, 'Periyodik bakım zamanı',
          coalesce(job_rec.service_no || ' · ', '') || job_rec.customer_name ||
          ' için periyodik bakım tarihi yaklaşıyor: ' ||
          to_char(job_rec.next_maintenance_at at time zone 'Europe/Istanbul','DD.MM.YYYY')
        );
        inserted_count := inserted_count + 1;
      exception when unique_violation then null;
      end;
    end loop;
  end loop;

  return inserted_count;
end;
$$;
