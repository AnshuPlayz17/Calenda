# Calenda — Data Model

Proposed schema. Postgres (Supabase). Every table has RLS enabled with a
default-deny posture; policies are sketched in §6.

Conventions: `id uuid primary key default gen_random_uuid()`, `created_at`/
`updated_at` as `timestamptz default now()`, soft-archive via `is_archived`
rather than deletion wherever history matters.

---

## 1. Identity and roles

```sql
create type user_role as enum ('student', 'parent', 'admin');

create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  full_name     text,
  avatar_url    text,
  role          user_role not null default 'student',
  grade         text,
  timezone      text not null default 'America/Toronto',
  onboarded_at  timestamptz
);
```

`role` is never writable by the client — an RLS policy excludes the column, and
the first admin is promoted by a one-time SQL statement. There is no application
code path that grants admin.

```sql
create type link_status as enum ('pending', 'accepted', 'revoked');

create table parent_links (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid not null references profiles on delete cascade,
  student_id   uuid not null references profiles on delete cascade,
  status       link_status not null default 'pending',
  invite_code  text unique,
  accepted_at  timestamptz,
  unique (parent_id, student_id),
  check (parent_id <> student_id)
);
```

**A link grants no data access on its own.** It only makes a person eligible for
the `shared_with_parents` fast path and for explicit `shares`.

```sql
create type share_permission as enum ('view', 'comment', 'edit');
create type shareable as enum ('event','class','notebook_page','assignment','task','file');

create table shares (
  id            uuid primary key default gen_random_uuid(),
  resource_type shareable not null,
  resource_id   uuid not null,
  grantee_id    uuid not null references profiles on delete cascade,
  granted_by    uuid not null references profiles on delete cascade,
  permission    share_permission not null default 'view',
  unique (resource_type, resource_id, grantee_id)
);
create index on shares (grantee_id, resource_type, resource_id);
```

Two sharing mechanisms, deliberately: `shared_with_parents boolean` on each
resource is the one-click path behind the *"Share with your parents?"* prompt;
`shares` handles specific people and finer permissions. The boolean keeps the
common case out of a join.

---

## 2. School years, categories, events

```sql
create table school_years (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique,          -- '2026–27'
  starts_on  date not null,
  ends_on    date not null,
  is_current boolean not null default false,
  check (ends_on > starts_on)
);
create unique index one_current_year on school_years (is_current) where is_current;

create table event_categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  color      text not null,
  icon       text,
  sort_order int  not null default 0,
  is_system  boolean not null default false
);

create table event_series (               -- e.g. the 16 Late Starts
  id             uuid primary key default gen_random_uuid(),
  school_year_id uuid not null references school_years on delete cascade,
  name           text not null
);
```

```sql
create type event_visibility as enum ('private', 'community');
create type event_status     as enum ('draft', 'pending', 'approved', 'rejected');
create type event_source     as enum ('manual', 'pdf_import', 'google', 'suggestion');

create table events (
  id             uuid primary key default gen_random_uuid(),
  school_year_id uuid not null references school_years,
  category_id    uuid references event_categories,
  series_id      uuid references event_series on delete set null,
  owner_id       uuid not null references profiles on delete cascade,

  title       text not null,
  description text,
  location    text,                        -- always null for PDF events
  priority    smallint not null default 0,

  -- All-day events are date-only and timezone-free; see SPEC §6.1.
  is_all_day boolean not null,
  start_date date not null,
  end_date   date not null,
  start_at   timestamptz,
  end_at     timestamptz,

  visibility       event_visibility not null default 'private',
  status           event_status     not null default 'approved',
  shared_with_parents boolean not null default false,

  approved_by      uuid references profiles,
  approved_at      timestamptz,
  review_note      text,                   -- rejection reason, shown to author

  source        event_source not null default 'manual',
  import_batch_id uuid references import_batches on delete set null,
  content_hash  text not null,             -- normalised(title) + start_date

  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(description,'')), 'B')
  ) stored,

  check (is_all_day = (start_at is null)),
  check (end_date >= start_date),
  check (visibility = 'community' or status = 'approved')
);
```

The last constraint encodes a rule worth making structural: **private events can
never sit in a pending state.** Approval exists only for community content.

`content_hash` is the dedupe key — normalised title *plus* `start_date`. Title
alone would collapse the 16 identical `Late Start` rows (see
`discovery/FINDINGS.md §7`).

**Indexes**

```sql
create index on events (school_year_id, start_date);
create index on events (start_date, end_date);                 -- calendar ranges
create index on events (owner_id, start_date);
create index on events (visibility, status, start_date)
       where visibility = 'community';                          -- community feed
create index on events (status) where status = 'pending';       -- admin queue
create index on events using gin (search_vector);
create index on events (content_hash, start_date);              -- dedupe probe
```

Suggestions are `visibility='community', status='pending'` — the same row before
and after approval, so authorship and history survive. Reviews are audited:

```sql
create table event_reviews (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events on delete cascade,
  reviewer_id uuid not null references profiles,
  action      text not null,               -- approved | rejected | edited
  note        text,
  created_at  timestamptz not null default now()
);
```

---

## 3. Import and duplicate review

```sql
create table import_batches (
  id             uuid primary key default gen_random_uuid(),
  admin_id       uuid not null references profiles,
  school_year_id uuid not null references school_years,
  source         event_source not null,
  filename       text,
  stats          jsonb not null default '{}',
  committed_at   timestamptz
);

create type dedupe_status as enum ('new', 'likely_duplicate', 'exact_duplicate', 'resolved');

create table import_staging (
  id               uuid primary key default gen_random_uuid(),
  batch_id         uuid not null references import_batches on delete cascade,
  raw              jsonb not null,        -- verbatim parser output
  parsed           jsonb not null,        -- normalised candidate event
  status           dedupe_status not null default 'new',
  match_event_id   uuid references events,
  match_score      numeric(4,3),
  resolution       text                   -- keep_existing | add_anyway | merge | replace
);
```

Nothing reaches `events` until the batch is reviewed and committed. This is what
makes the duplicate-confirmation UI possible rather than retrofitted.

---

## 4. Classes, notebooks, work, files

```sql
create table classes (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references profiles on delete cascade,
  school_year_id uuid not null references school_years,
  name           text not null,
  course_code    text,                      -- 'ICS3U' — primary Google matcher
  teacher        text,
  room           text,
  color          text,
  is_archived    boolean not null default false,
  shared_with_parents boolean not null default false,
  unique (owner_id, school_year_id, name)
);
create index on classes (owner_id, school_year_id) where not is_archived;
create index on classes (course_code);

create table notebook_pages (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid not null references classes on delete cascade,
  owner_id       uuid not null references profiles on delete cascade,
  parent_page_id uuid references notebook_pages on delete cascade,   -- tree
  title          text not null default 'Untitled',
  icon           text,
  content        jsonb not null default '{}',   -- TipTap document
  content_text   text  not null default '',     -- flattened, for search
  position       numeric not null default 0,    -- fractional ordering
  is_archived    boolean not null default false,
  shared_with_parents boolean not null default false,
  search_vector  tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(content_text,'')), 'B')
  ) stored
);
create index on notebook_pages (class_id, parent_page_id, position);
create index on notebook_pages using gin (search_vector);
```

`position` is `numeric`, so reordering a page rewrites one row rather than
renumbering its siblings.

```sql
create type work_status   as enum ('not_started', 'in_progress', 'completed');
create type work_priority as enum ('low', 'normal', 'high');

create table assignments (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references classes on delete cascade,
  owner_id      uuid not null references profiles on delete cascade,
  title         text not null,
  description   text,
  due_at        timestamptz,
  due_all_day   boolean not null default false,
  priority      work_priority not null default 'normal',
  status        work_status   not null default 'not_started',
  estimated_minutes int,
  event_id      uuid references events on delete set null,  -- generated mirror
  completed_at  timestamptz,
  shared_with_parents boolean not null default false
);
create index on assignments (owner_id, status, due_at);
create index on assignments (class_id, due_at);

create table tasks (
  id       uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles on delete cascade,
  class_id uuid references classes on delete cascade,        -- nullable
  title    text not null,
  notes    text,
  due_at   timestamptz,
  priority work_priority not null default 'normal',
  status   work_status   not null default 'not_started',
  completed_at timestamptz
);
```

`assignments.event_id` is the single-entry guarantee from SPEC §9: the assignment
owns its calendar mirror, and a trigger keeps title/date in step.

```sql
create table files (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references classes on delete cascade,
  owner_id     uuid not null references profiles on delete cascade,
  storage_path text not null unique,        -- non-guessable; signed URLs only
  filename     text not null,
  mime_type    text not null,
  size_bytes   bigint not null,
  shared_with_parents boolean not null default false
);

create table file_links (                    -- attach a file to a note or assignment
  file_id     uuid not null references files on delete cascade,
  target_type shareable not null,
  target_id   uuid not null,
  primary key (file_id, target_type, target_id)
);
```

---

## 5. Google Calendar

```sql
create type sync_direction as enum ('import_only', 'export_only', 'two_way');

create table google_accounts (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profiles on delete cascade,
  google_sub    text not null unique,
  email         text not null,
  refresh_token text not null,               -- encrypted at rest (Vault)
  scopes        text[] not null,
  last_sync_at  timestamptz,
  sync_error    text,
  unique (profile_id, google_sub)
);

create table google_calendars (
  id                uuid primary key default gen_random_uuid(),
  google_account_id uuid not null references google_accounts on delete cascade,
  calendar_id       text not null,
  summary           text not null,
  access_role       text not null,           -- 'reader' forbids export
  is_selected       boolean not null default false,
  direction         sync_direction not null default 'import_only',
  sync_token        text,                    -- Google incremental cursor
  unique (google_account_id, calendar_id)
);

create table google_event_map (
  id                  uuid primary key default gen_random_uuid(),
  google_calendar_ref uuid not null references google_calendars on delete cascade,
  google_event_id     text not null,
  event_id            uuid not null references events on delete cascade,
  etag                text,
  remote_updated_at   timestamptz,
  local_updated_at    timestamptz,
  last_synced_at      timestamptz,
  unique (google_calendar_ref, google_event_id),
  unique (event_id, google_calendar_ref)
);
```

`google_event_map` is what makes two-way sync safe. The pair of unique
constraints means one Google event maps to exactly one Calenda event **and** the
reverse — an echo cannot create a second row, it collides. Combined with
`extendedProperties.private.calenda_event_id` on exported events, a write read
back is recognised even if the map row were lost.

---

## 6. Notifications

```sql
create type notify_channel as enum ('email', 'web_push', 'sms');
create type notify_state   as enum ('pending', 'sent', 'failed', 'skipped');

create table notification_preferences (
  profile_id     uuid primary key references profiles on delete cascade,
  channels       notify_channel[] not null default '{email}',
  digest_daily   boolean not null default false,
  digest_daily_at time not null default '07:00',
  digest_weekly  boolean not null default false,
  quiet_start    time,
  quiet_end      time
);

create table notification_category_prefs (
  profile_id     uuid not null references profiles on delete cascade,
  category_id    uuid not null references event_categories on delete cascade,
  enabled        boolean not null default true,
  offsets_minutes int[] not null default '{1440}',   -- multiple reminders
  primary key (profile_id, category_id)
);

create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text
);

create table phone_numbers (              -- dormant until SMS is funded
  profile_id     uuid primary key references profiles on delete cascade,
  e164           text not null,
  verified_at    timestamptz,
  consent_at     timestamptz,             -- captured now, never retrofitted
  verification_hash text
);
```

```sql
create table notification_queue (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references profiles on delete cascade,
  subject_type   text not null,           -- 'event' | 'assignment'
  subject_id     uuid not null,
  channel        notify_channel not null,
  offset_minutes int not null,
  scheduled_for  timestamptz not null,
  state          notify_state not null default 'pending',
  attempts       smallint not null default 0,
  sent_at        timestamptz,
  error          text,

  -- Makes a duplicate reminder impossible, not merely unlikely.
  unique (profile_id, subject_type, subject_id, channel, offset_minutes)
);
create index on notification_queue (scheduled_for) where state = 'pending';
```

That unique constraint is the answer to SPEC §10.1. A cron that retries,
overlaps or double-fires cannot insert a second identical reminder — the
database refuses it. Workers claim rows with a conditional
`update ... where state='pending'` so two concurrent dispatchers cannot both
send the same row.

---

## 7. RLS sketch

Helper functions, `security definer`, so policies stay readable and consistent:

```sql
create function is_admin() returns boolean language sql stable as $$
  select exists (select 1 from profiles
                 where id = auth.uid() and role = 'admin');
$$;

create function is_linked_parent_of(student uuid) returns boolean
language sql stable as $$
  select exists (select 1 from parent_links
                 where parent_id = auth.uid()
                   and student_id = student
                   and status = 'accepted');
$$;

create function has_share(rt shareable, rid uuid) returns boolean
language sql stable as $$
  select exists (select 1 from shares
                 where grantee_id = auth.uid()
                   and resource_type = rt and resource_id = rid);
$$;
```

Representative policy — events:

```sql
alter table events enable row level security;

create policy events_select on events for select using (
     owner_id = auth.uid()
  or (visibility = 'community' and status = 'approved')
  or (shared_with_parents and is_linked_parent_of(owner_id))
  or has_share('event', id)
  or (is_admin() and visibility = 'community')
);

create policy events_insert on events for insert with check (
  owner_id = auth.uid()
  and (visibility = 'private' or status = 'pending' or is_admin())
);

create policy events_update on events for update using (
  owner_id = auth.uid() or (is_admin() and visibility = 'community')
);
```

Three properties worth stating explicitly, because they are the requirements
from SPEC §4 expressed as code:

1. **A parent link alone grants nothing** — every parent branch also requires
   `shared_with_parents` or an explicit `shares` row.
2. **An admin has no read path to private content** — the admin branch is
   guarded by `visibility = 'community'` in both select and update.
3. **A normal user cannot self-approve** — the insert check permits
   `status='pending'` for community events; only `is_admin()` may write
   `approved`.

The same shape applies to `classes`, `notebook_pages`, `assignments`, `tasks`
and `files`, substituting the owning class's `owner_id` where the resource is
nested. Search runs through a view over these tables, so it inherits the
policies and **cannot leak a resource the user could not otherwise open**.
