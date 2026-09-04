-- ============================================================================
-- Search
--
-- The inputs that matter are the ones a person actually types: half a word,
-- several words, and stray punctuation. Two of the three took the whole
-- function down before these existed -- to_tsquery raises a syntax error on
-- "biology midterm:*", so searching for anything with a space in it returned
-- an error rather than results.
-- ============================================================================
\set QUIET on
set client_min_messages = notice;

create or replace function search_reset() returns void
language plpgsql security definer set search_path = public, auth as $$
declare y uuid; holiday uuid; exam uuid;
begin
  delete from auth.users where email like '%@search.test';
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000f1', 'student@search.test');

  select id into y from school_years where is_current limit 1;
  select id into holiday from event_categories where slug = 'holiday';
  select id into exam    from event_categories where slug = 'exam';

  insert into events (school_year_id, owner_id, category_id, title, description,
                      content_hash, is_all_day, start_date, end_date,
                      visibility, status, source)
  values
    (y, '00000000-0000-0000-0000-0000000000f1', holiday, 'Winter Break',
     'no classes', 'winter break::2026-12-21', true,
     '2026-12-21', '2027-01-03', 'community', 'approved', 'pdf_import'),
    (y, '00000000-0000-0000-0000-0000000000f1', exam, 'Biology midterm',
     'unit 3', 'biology midterm::2026-11-10', true,
     '2026-11-10', '2026-11-10', 'private', 'approved', 'manual');
end $$;

select search_reset();

do $$
declare n integer;
begin
  -- A whole word.
  select count(*) into n from search_everything('winter');
  assert n = 1, format('one match for "winter", got %s', n);

  -- Half a word, which is what search looks like while you are still typing.
  select count(*) into n from search_everything('bio');
  assert n = 1, format('prefix "bio" should find Biology midterm, got %s', n);

  -- Several words. to_tsquery raises a syntax error on "biology midterm:*",
  -- so before the prefix was built from the last word alone, every multi-word
  -- search failed outright.
  select count(*) into n from search_everything('biology midterm');
  assert n = 1, format('multi-word search, got %s', n);

  -- Punctuation and operators a person might type without meaning them as
  -- syntax. websearch_to_tsquery tolerates these; to_tsquery does not.
  select count(*) into n from search_everything('"winter break" OR bio');
  assert n >= 1, format('quoted phrase with OR should not throw, got %s', n);

  select count(*) into n from search_everything('what''s on? (exams)');
  assert n >= 0, 'apostrophes and brackets must not throw';

  -- Nothing matching is a result, not an error.
  select count(*) into n from search_everything('zzzzqqq');
  assert n = 0, format('nonsense should match nothing, got %s', n);

  -- Empty input must not throw either; the UI does not search until you type,
  -- but the function should not depend on that.
  select count(*) into n from search_everything('');
  assert n = 0, format('empty query, got %s', n);

  -- Unapproved events stay out of search, exactly as they stay off calendars.
  update events set status = 'pending'
   where title = 'Winter Break'
     and owner_id = '00000000-0000-0000-0000-0000000000f1';
  select count(*) into n from search_everything('winter');
  assert n = 0, format('a pending event must not surface in search, got %s', n);

  raise notice 'search: all assertions passed';
end $$;

delete from auth.users where email like '%@search.test';
drop function if exists search_reset();
