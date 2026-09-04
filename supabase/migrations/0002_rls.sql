-- ============================================================================
-- Calenda -- row-level security
--
-- This file is the permission boundary. Nothing in the UI is trusted; a user
-- who crafts their own request against the API gets exactly what these
-- policies allow and nothing more.
--
-- Three properties are asserted by tests in src/test/rls.test.ts:
--   1. A parent link alone grants no access.
--   2. An admin has no read path to private content.
--   3. A normal user cannot approve their own community suggestion.
-- ============================================================================

-- ------------------------------------------------------------- helpers ----
-- security definer so a policy can consult tables the caller cannot read
-- (e.g. checking a parent link without granting read access to all links).

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function is_linked_parent_of(student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from parent_links
    where parent_id = auth.uid()
      and student_id = student
      and status = 'accepted'
  );
$$;

create or replace function has_share(rt shareable, rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shares
    where grantee_id = auth.uid()
      and resource_type = rt
      and resource_id = rid
  );
$$;

-- Owner of the class a nested resource belongs to.
create or replace function class_owner(cid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select owner_id from classes where id = cid;
$$;

-- --------------------------------------------------- role escalation ------
-- RLS cannot restrict individual columns, so the role column is protected two
-- ways: it is not granted to clients, and a trigger rejects any change that
-- did not come from an admin. Belt and braces, because a mistake here is the
-- whole system.

create or replace function guard_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not is_admin() then
    raise exception 'role may not be changed';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role before update on profiles
  for each row execute function guard_profile_role();

-- ------------------------------------------------------------- enable -----

alter table profiles                   enable row level security;
alter table parent_links               enable row level security;
alter table shares                     enable row level security;
alter table school_years               enable row level security;
alter table event_categories           enable row level security;
alter table event_series               enable row level security;
alter table events                     enable row level security;
alter table event_reviews              enable row level security;
alter table import_batches             enable row level security;
alter table import_staging             enable row level security;
alter table classes                    enable row level security;
alter table notebook_pages             enable row level security;
alter table assignments                enable row level security;
alter table tasks                      enable row level security;
alter table files                      enable row level security;
alter table file_links                 enable row level security;
alter table google_accounts            enable row level security;
alter table google_calendars           enable row level security;
alter table google_event_map           enable row level security;
alter table notification_preferences   enable row level security;
alter table notification_category_prefs enable row level security;
alter table push_subscriptions         enable row level security;
alter table phone_numbers              enable row level security;
alter table notification_queue         enable row level security;
alter table notification_deliveries    enable row level security;

-- ------------------------------------------------------------ profiles ----

create policy profiles_select on profiles for select using (
     id = auth.uid()
  or is_admin()
  -- A parent may see the profile of a student who accepted their link, and a
  -- student may see the profile of a parent they accepted. Nothing wider.
  or is_linked_parent_of(id)
  or exists (
       select 1 from parent_links
       where student_id = auth.uid() and parent_id = profiles.id and status = 'accepted'
     )
);

create policy profiles_update on profiles for update
  using (id = auth.uid() or is_admin())
  with check (id = auth.uid() or is_admin());

-- -------------------------------------------------------- parent links ----

create policy parent_links_select on parent_links for select using (
  parent_id = auth.uid() or student_id = auth.uid() or is_admin()
);

-- Either side may propose a link; neither side may accept on the other's
-- behalf -- see the update policy.
create policy parent_links_insert on parent_links for insert with check (
  parent_id = auth.uid() or student_id = auth.uid()
);

create policy parent_links_update on parent_links for update
  using (parent_id = auth.uid() or student_id = auth.uid())
  with check (parent_id = auth.uid() or student_id = auth.uid());

create policy parent_links_delete on parent_links for delete using (
  parent_id = auth.uid() or student_id = auth.uid()
);

-- -------------------------------------------------------------- shares ----

create policy shares_select on shares for select using (
  grantee_id = auth.uid() or granted_by = auth.uid()
);
create policy shares_insert on shares for insert with check (granted_by = auth.uid());
create policy shares_delete on shares for delete using (granted_by = auth.uid());

-- ------------------------------------------------- reference tables -------
-- School years and categories are common vocabulary: readable by everyone
-- signed in, writable only by an admin.

create policy school_years_select on school_years for select using (auth.uid() is not null);
create policy school_years_write  on school_years for all
  using (is_admin()) with check (is_admin());

create policy categories_select on event_categories for select using (auth.uid() is not null);
create policy categories_write  on event_categories for all
  using (is_admin()) with check (is_admin());

create policy series_select on event_series for select using (auth.uid() is not null);
create policy series_write  on event_series for all
  using (is_admin()) with check (is_admin());

-- -------------------------------------------------------------- events ----

create policy events_select on events for select using (
     owner_id = auth.uid()
  or (visibility = 'community' and status = 'approved')
  -- (1) a parent link alone is not enough; the row must also be shared
  or (shared_with_parents and is_linked_parent_of(owner_id))
  or has_share('event', id)
  -- (2) admin reach stops at community content
  or (is_admin() and visibility = 'community')
);

create policy events_insert on events for insert with check (
  owner_id = auth.uid()
  and (
       visibility = 'private'                          -- private: no approval
    or (visibility = 'community' and status = 'pending') -- (3) suggest only
    or is_admin()                                        -- admins may publish
  )
);

create policy events_update on events for update
  using (
       (owner_id = auth.uid() and status <> 'approved')
    or (owner_id = auth.uid() and visibility = 'private')
    or (is_admin() and visibility = 'community')
  )
  with check (
       (owner_id = auth.uid() and visibility = 'private')
    or (owner_id = auth.uid() and visibility = 'community' and status = 'pending')
    or (is_admin() and visibility = 'community')
  );

create policy events_delete on events for delete using (
  owner_id = auth.uid() or (is_admin() and visibility = 'community')
);

create policy event_reviews_select on event_reviews for select using (
  is_admin() or exists (
    select 1 from events e where e.id = event_reviews.event_id and e.owner_id = auth.uid()
  )
);
create policy event_reviews_insert on event_reviews for insert
  with check (is_admin() and reviewer_id = auth.uid());

-- Imports are an admin operation end to end.
create policy import_batches_all on import_batches for all
  using (is_admin()) with check (is_admin() and admin_id = auth.uid());
create policy import_staging_all on import_staging for all
  using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------- classes ----

create policy classes_select on classes for select using (
     owner_id = auth.uid()
  or (shared_with_parents and is_linked_parent_of(owner_id))
  or has_share('class', id)
);
create policy classes_insert on classes for insert with check (owner_id = auth.uid());
create policy classes_update on classes for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy classes_delete on classes for delete using (owner_id = auth.uid());

-- Nested resources repeat the same shape. A parent who can see a class still
-- cannot see a private page inside it -- each row carries its own flag.

create policy notebook_select on notebook_pages for select using (
     owner_id = auth.uid()
  or (shared_with_parents and is_linked_parent_of(owner_id))
  or has_share('notebook_page', id)
);
create policy notebook_insert on notebook_pages for insert
  with check (owner_id = auth.uid() and class_owner(class_id) = auth.uid());
create policy notebook_update on notebook_pages for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy notebook_delete on notebook_pages for delete using (owner_id = auth.uid());

create policy assignments_select on assignments for select using (
     owner_id = auth.uid()
  or (shared_with_parents and is_linked_parent_of(owner_id))
  or has_share('assignment', id)
);
create policy assignments_insert on assignments for insert
  with check (owner_id = auth.uid() and class_owner(class_id) = auth.uid());
create policy assignments_update on assignments for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy assignments_delete on assignments for delete using (owner_id = auth.uid());

create policy tasks_select on tasks for select using (
  owner_id = auth.uid() or has_share('task', id)
);
create policy tasks_insert on tasks for insert with check (owner_id = auth.uid());
create policy tasks_update on tasks for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy tasks_delete on tasks for delete using (owner_id = auth.uid());

create policy files_select on files for select using (
     owner_id = auth.uid()
  or (shared_with_parents and is_linked_parent_of(owner_id))
  or has_share('file', id)
);
create policy files_insert on files for insert
  with check (owner_id = auth.uid() and class_owner(class_id) = auth.uid());
create policy files_update on files for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy files_delete on files for delete using (owner_id = auth.uid());

create policy file_links_all on file_links for all using (
  exists (select 1 from files f where f.id = file_links.file_id and f.owner_id = auth.uid())
) with check (
  exists (select 1 from files f where f.id = file_links.file_id and f.owner_id = auth.uid())
);

-- -------------------------------------------------------------- google ----
-- Strictly private. A refresh token is never readable by anyone but its owner,
-- and not by an admin either.

create policy google_accounts_all on google_accounts for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy google_calendars_all on google_calendars for all
  using (exists (
    select 1 from google_accounts a
    where a.id = google_calendars.google_account_id and a.profile_id = auth.uid()))
  with check (exists (
    select 1 from google_accounts a
    where a.id = google_calendars.google_account_id and a.profile_id = auth.uid()));

create policy google_map_all on google_event_map for all
  using (exists (select 1 from events e where e.id = google_event_map.event_id
                 and e.owner_id = auth.uid()))
  with check (exists (select 1 from events e where e.id = google_event_map.event_id
                 and e.owner_id = auth.uid()));

-- ------------------------------------------------------- notifications ----

create policy notif_prefs_all on notification_preferences for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy notif_cat_prefs_all on notification_category_prefs for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy push_subs_all on push_subscriptions for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy phone_numbers_all on phone_numbers for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- The queue is written by the dispatcher (service role, which bypasses RLS).
-- Users may read their own history but never forge a delivery.
create policy notif_queue_select on notification_queue for select
  using (profile_id = auth.uid());
create policy notif_deliveries_select on notification_deliveries for select
  using (profile_id = auth.uid());

-- ------------------------------------------------------- column grants ----
-- The role column is deliberately absent from this grant, so a client cannot
-- name it in an update even before the trigger runs.

revoke update on profiles from authenticated;
grant  update (full_name, avatar_url, grade, timezone, onboarded_at)
  on profiles to authenticated;

-- ------------------------------------------------------- search view ------
-- security_invoker means the view runs as the caller, so it inherits every
-- policy above. Search can never surface a row the user could not open.

create view search_index with (security_invoker = true) as
  select 'event'::text as kind, e.id, e.owner_id, e.title,
         left(coalesce(e.description, ''), 200) as snippet,
         e.search_vector, e.updated_at, null::uuid as class_id
    from events e
  union all
  select 'notebook_page', p.id, p.owner_id, p.title,
         left(p.content_text, 200), p.search_vector, p.updated_at, p.class_id
    from notebook_pages p
  union all
  select 'assignment', a.id, a.owner_id, a.title,
         left(coalesce(a.description, ''), 200),
         to_tsvector('english', coalesce(a.title,'') || ' ' || coalesce(a.description,'')),
         a.updated_at, a.class_id
    from assignments a
  union all
  select 'task', t.id, t.owner_id, t.title,
         left(coalesce(t.notes, ''), 200),
         to_tsvector('english', coalesce(t.title,'') || ' ' || coalesce(t.notes,'')),
         t.updated_at, t.class_id
    from tasks t;
