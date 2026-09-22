-- ============================================================================
-- Deleting an account, end to end, against a real Postgres.
--
-- WHY THIS FILE EXISTS
--
-- Nothing had ever deleted an account, so nothing had ever discovered that two
-- foreign keys refused to let it happen. `event_reviews.reviewer_id` and
-- `import_batches.admin_id` were `not null references profiles` with no delete
-- rule, which is NO ACTION, which raises. Both are written by admin actions,
-- so a student would have deleted cleanly and the owner -- the one person who
-- would ever be asked to run a deletion request -- would have got a foreign
-- key violation dressed up as a 500.
--
-- The test that finds that is not "does the constraint say cascade". It is
-- "delete an account that has one of everything and require that nothing of
-- that person is left". A constraint can be read; a deletion has to be run.
--
-- Run:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/account_delete_test.sql
-- ============================================================================

\set QUIET on
set client_min_messages = warning;

create or replace function ad_expect(label text, actual anyelement, wanted anyelement)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL  %  (got %, expected %)', label, actual, wanted;
  end if;
  raise notice 'pass  %', label;
end;
$$;

-- ---------------------------------------------------------------- fixtures --

create or replace function ad_reset() returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  y uuid;
  c uuid;
  e uuid;
begin
  delete from auth.users where email like '%@del.test';

  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000d1', 'leaver@del.test'),
    ('00000000-0000-0000-0000-0000000000d2', 'stayer@del.test');

  -- handle_new_user() makes the profiles. Both are admins here, because the
  -- two columns under test are only ever written by an admin and a student
  -- would pass this file without touching them.
  update profiles set role = 'admin'
   where id in ('00000000-0000-0000-0000-0000000000d1',
                '00000000-0000-0000-0000-0000000000d2');

  insert into school_years (label, starts_on, ends_on)
  values ('2026-27 del', '2026-09-01', '2027-06-30')
  returning id into y;

  -- One of everything the leaver owns.
  insert into classes (owner_id, school_year_id, name)
  values ('00000000-0000-0000-0000-0000000000d1', y, 'Physics')
  returning id into c;

  -- The leaver's own event, which must go.
  insert into events (school_year_id, owner_id, title, is_all_day, start_date,
                      end_date, visibility, status, content_hash)
  values (y, '00000000-0000-0000-0000-0000000000d1', 'Mine', true, '2026-10-01',
          '2026-10-01', 'private', 'approved', 'del-mine-hash');

  -- Somebody ELSE's event, which the leaver reviewed. This is the realistic
  -- shape and the first fixture got it wrong: with the reviewed event owned by
  -- the leaver, deleting the account cascaded the event, which cascaded the
  -- review, and the assertion that a review survives failed for a reason that
  -- had nothing to do with the foreign key under test. An admin approves a
  -- community event; they do not approve their own.
  insert into events (school_year_id, owner_id, title, is_all_day, start_date,
                      end_date, visibility, status, content_hash)
  values (y, '00000000-0000-0000-0000-0000000000d2', 'Theirs', true, '2026-10-02',
          '2026-10-02', 'community', 'approved', 'del-theirs-hash')
  returning id into e;

  insert into assignments (owner_id, class_id, title, due_at)
  values ('00000000-0000-0000-0000-0000000000d1', c, 'Lab report', '2026-10-05 12:00Z');

  insert into notebook_pages (owner_id, class_id, title, content, content_text, position)
  values ('00000000-0000-0000-0000-0000000000d1', c, 'Notes', '{}'::jsonb, 'x', 1);

  insert into grades (owner_id, class_id, title, score, out_of)
  values ('00000000-0000-0000-0000-0000000000d1', c, 'Quiz', 17, 20);

  insert into tasks (owner_id, title) values
    ('00000000-0000-0000-0000-0000000000d1', 'Buy a binder');

  insert into push_subscriptions (profile_id, endpoint, p256dh, auth)
  values ('00000000-0000-0000-0000-0000000000d1', 'https://example.test/1', 'k', 'a');

  -- The two that refused. Both belong to the leaver, and both are ABOUT data
  -- that is not theirs -- which is why they are set null rather than cascaded.
  insert into event_reviews (event_id, reviewer_id, action)
  values (e, '00000000-0000-0000-0000-0000000000d1', 'approved');

  insert into import_batches (admin_id, school_year_id, source)
  values ('00000000-0000-0000-0000-0000000000d1', y, 'manual');
end;
$$;

select ad_reset();
set client_min_messages = notice;

-- =================================================================== tests ===

do $$
declare
  n int;
  survivors int;
begin
  -- (1) The delete itself. Before 20260922000100 this raised, and the whole
  -- feature was unreachable for exactly the account most likely to use it.
  begin
    delete from auth.users where id = '00000000-0000-0000-0000-0000000000d1';
  exception when others then
    raise exception 'FAIL  deleting the account raised: %', sqlerrm;
  end;
  raise notice 'pass  the account can be deleted at all';

  -- (2) The profile went with the auth user.
  select count(*) into n from profiles
   where id = '00000000-0000-0000-0000-0000000000d1';
  perform ad_expect('the profile is gone', n, 0);

  -- (3) Everything owned is gone. Counted per table rather than in one query,
  -- so a failure names the table that kept something.
  select count(*) into n from classes where owner_id = '00000000-0000-0000-0000-0000000000d1';
  perform ad_expect('no classes left', n, 0);
  select count(*) into n from events where owner_id = '00000000-0000-0000-0000-0000000000d1';
  perform ad_expect('no events left', n, 0);
  select count(*) into n from assignments where owner_id = '00000000-0000-0000-0000-0000000000d1';
  perform ad_expect('no assignments left', n, 0);
  select count(*) into n from notebook_pages where owner_id = '00000000-0000-0000-0000-0000000000d1';
  perform ad_expect('no notes left', n, 0);
  select count(*) into n from grades where owner_id = '00000000-0000-0000-0000-0000000000d1';
  perform ad_expect('no marks left', n, 0);
  select count(*) into n from tasks where owner_id = '00000000-0000-0000-0000-0000000000d1';
  perform ad_expect('no tasks left', n, 0);
  select count(*) into n from push_subscriptions where profile_id = '00000000-0000-0000-0000-0000000000d1';
  perform ad_expect('no push subscriptions left', n, 0);

  -- (4) The two audit rows survive, and neither names the person any more.
  -- This is the half a privacy policy has to be exact about: the act stays,
  -- the actor is forgotten.
  select count(*) into n from event_reviews where reviewer_id is null;
  perform ad_expect('the review survives with no reviewer', n, 1);
  select count(*) into n from import_batches where admin_id is null;
  perform ad_expect('the import batch survives with no importer', n, 1);

end;
$$;

-- (5) Every foreign key into `profiles`, swept.
--
-- This is the assertion that does not have to be kept in step with the schema.
-- It asks every column in the database that references `profiles` whether it
-- still points at the deleted id -- so a table added next year with a missing
-- delete rule fails here without anybody remembering to add a line to this
-- file. It is dynamic SQL because the columns are not known until it runs.
do $$
declare
  r record;
  n int;
  total int := 0;
  checked int := 0;
begin
  for r in
    select ns.nspname  as schema_name,
           child.relname as table_name,
           att.attname   as column_name
      from pg_constraint con
      join pg_class child on child.oid = con.conrelid
      join pg_namespace ns on ns.oid = child.relnamespace
      join unnest(con.conkey) as k on true
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k
     where con.contype = 'f'
       and con.confrelid = 'public.profiles'::regclass
       and ns.nspname = 'public'
  loop
    execute format(
      'select count(*) from %I.%I where %I = $1',
      r.schema_name, r.table_name, r.column_name
    ) into n using '00000000-0000-0000-0000-0000000000d1'::uuid;
    checked := checked + 1;
    if n > 0 then
      raise warning 'STILL POINTS AT THE DELETED ACCOUNT: %.% (%) -- % row(s)',
        r.schema_name, r.table_name, r.column_name, n;
      total := total + n;
    end if;
  end loop;

  -- The sweep has to have swept something. A query that finds no foreign keys
  -- reports a perfectly clean database and means the opposite -- this project
  -- has shipped that guard twice.
  perform ad_expect('the sweep found the foreign keys to check', checked >= 30, true);
  perform ad_expect('nothing anywhere still points at the deleted account', total, 0);
end;
$$;

-- (6) The other account is untouched. A delete that takes a neighbour with it
-- is worse than one that refuses.
do $$
declare n int;
begin
  select count(*) into n from profiles
   where id = '00000000-0000-0000-0000-0000000000d2';
  perform ad_expect('the other account is still there', n, 1);
end;
$$;

select 'account_delete_test: all assertions passed' as result;
