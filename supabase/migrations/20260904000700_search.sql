-- ---------------------------------------------------------------------------
-- One search across everything.
--
-- events.search_vector and notebook_pages.search_vector have existed since the
-- first migration, both with GIN indexes, and nothing has ever queried them.
--
-- Deliberately NOT security definer. Search must return exactly what the
-- caller is already allowed to read, and the row-level policies say what that
-- is. A definer function would have to re-implement every one of them, and
-- would silently become a way around them the first time one changed.
-- ---------------------------------------------------------------------------

create or replace function search_everything(
  q             text,
  school_year   uuid default null,
  max_results   integer default 20
)
returns table (
  kind      text,
  id        uuid,
  title     text,
  subtitle  text,
  occurs_on date,
  class_id  uuid,
  rank      real
)
language sql
stable
set search_path = public
as $$
  select r.kind, r.id, r.title, r.subtitle, r.occurs_on, r.class_id, r.rank
  from (
  with terms as (
    -- websearch_to_tsquery accepts whatever a person types -- quotes, OR, a
    -- stray bracket -- without throwing, which to_tsquery does on all of them.
    select
      websearch_to_tsquery('english', q) as tsq,
      -- A prefix match on the LAST word, so "bio" finds "biology" mid-typing.
      -- Built from a captured alphanumeric run rather than the raw string:
      -- feeding "biology midterm:*" or '"winter break" OR bio:*' to to_tsquery
      -- is a syntax error, which took the whole search down.
      (
        select case
                 when w is null or w = '' then null
                 else to_tsquery('english', w || ':*')
               end
        from (
          select lower((regexp_match(coalesce(q, ''), '([A-Za-z0-9]+)\s*$'))[1]) as w
        ) t
      ) as tsq_prefix
  )
  (
    select
      'event'::text                             as kind,
      e.id                                      as id,
      e.title                                   as title,
      coalesce(e.description, e.location)       as subtitle,
      e.start_date                              as occurs_on,
      null::uuid                                as class_id,
      ts_rank(e.search_vector, terms.tsq)       as rank
    from events e, terms
    where e.status = 'approved'
      and (school_year is null or e.school_year_id = school_year)
      and (
        e.search_vector @@ terms.tsq
        or (terms.tsq_prefix is not null and e.search_vector @@ terms.tsq_prefix)
      )
  )
  union all
  (
    select
      'note'::text,
      n.id,
      n.title,
      left(coalesce(n.content_text, ''), 120),
      null::date,
      n.class_id,
      ts_rank(n.search_vector, terms.tsq)
    from notebook_pages n, terms
    where n.search_vector @@ terms.tsq
       or (terms.tsq_prefix is not null and n.search_vector @@ terms.tsq_prefix)
  )
  union all
  (
    -- Assignments and classes have no tsvector: there are only ever a handful
    -- per person, so an index would cost more than it saves.
    select
      'assignment'::text,
      a.id,
      a.title,
      c.name,
      (a.due_at at time zone 'UTC')::date,
      a.class_id,
      0.5::real
    from assignments a
    join classes c on c.id = a.class_id
    where a.title ilike '%' || q || '%'
  )
  union all
  (
    select
      'class'::text,
      c.id,
      c.name,
      coalesce(c.course_code, c.teacher),
      null::date,
      c.id,
      0.5::real
    from classes c
    where c.name ilike '%' || q || '%'
       or coalesce(c.course_code, '') ilike '%' || q || '%'
  )
  ) as r
  -- The union branches are parenthesised, so their columns are not in scope
  -- for an ORDER BY on the union itself; the wrapper gives them names.
  order by r.rank desc, r.title
  limit greatest(1, least(max_results, 50));
$$;

comment on function search_everything is
  'Full-text search across events and notes, plus title matching on '
  'assignments and classes. Security invoker: RLS decides what is visible.';

grant execute on function search_everything(text, uuid, integer) to authenticated;
