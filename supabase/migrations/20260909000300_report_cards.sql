-- ============================================================================
-- Report cards: upload one, have it read, confirm what it says, keep the marks.
--
-- This is the import pipeline again for a second kind of document, and it is
-- deliberately the same shape as the first one -- `import_batches` holding a
-- document and `import_staging` holding rows that are proposed rather than
-- filed. The rule from the calendar import applies here word for word:
-- **nothing is silently merged.** A model reading a photograph of a report
-- card produces a proposal. The student confirms it, line by line, before a
-- single mark is written into `grades`.
--
-- THE MOST SENSITIVE DOCUMENT IN THE APP
--
-- A report card carries a full name, a school, a year, every mark, and usually
-- a teacher's written comment about the person. Two consequences are built in
-- rather than left to the UI:
--
--   1. Both tables are owner-only. There is no parent arm in any policy here,
--      not even a shared one. A student may choose to share an individual mark
--      -- that is what `grades.shared_with_parents` is for -- and that is a
--      different act from handing over the document it came from, with its
--      comments and everything else on it. Sharing a mark must never
--      retroactively expose the report card.
--
--   2. The file lives in a private bucket under the student's own uid prefix,
--      and 20260909000400 is what enforces that. `storage_path` here is only a
--      pointer; the storage policies are the control.
--
-- THE DOCUMENT LEAVES THE COUNTRY
--
-- Decoding means sending the contents to a third-party model. That is a real
-- disclosure and the student is told before they upload, in the UI, in plain
-- words -- not in a policy nobody reads. `decode_consent_at` records that they
-- were told and went ahead, because a claim that somebody consented is worth
-- nothing if there is no row saying when.
--
-- ACCURACY IS NOT ASSUMED ANYWHERE
--
-- `confidence` is stored per line and shown. Lines the model was unsure about
-- sort to the top of the review screen rather than being hidden. Nothing is
-- pre-accepted -- `decision` starts at 'pending' for every row, including the
-- ones the model is certain about, because a model's certainty is not evidence
-- and this is somebody's transcript.
-- ============================================================================

create table if not exists report_cards (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references profiles on delete cascade,
  school_year_id uuid references school_years,

  -- Path inside the private `attachments` bucket. Always prefixed with the
  -- owner's uid -- see 20260909000400, which refuses anything else.
  storage_path   text not null,
  original_name  text,
  mime_type      text,
  byte_size      integer check (byte_size is null or byte_size > 0),
  term           text,

  status         text not null default 'uploaded'
                 check (status in ('uploaded','decoding','decoded','failed','applied')),
  -- Said out loud rather than swallowed. A decode that failed and shows
  -- nothing is indistinguishable from one that found no marks.
  error          text,

  -- When the student was shown what decoding involves and chose to go ahead.
  -- Null means it has not been sent anywhere.
  decode_consent_at timestamptz,
  decoded_at     timestamptz,
  applied_at     timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table report_cards is
  'An uploaded report card and how far through reading it we are. Owner-only, '
  'with no parent access at any point -- sharing an individual mark is a '
  'different act from sharing the document it came from.';

create index if not exists report_cards_owner_idx
  on report_cards (owner_id, created_at desc);

drop trigger if exists report_cards_touch on report_cards;
create trigger report_cards_touch before update on report_cards
  for each row execute function set_updated_at();

-- --------------------------------------------------------------- lines -----

create table if not exists report_card_lines (
  id              uuid primary key default gen_random_uuid(),
  report_card_id  uuid not null references report_cards on delete cascade,
  owner_id        uuid not null references profiles on delete cascade,

  -- What the model read, verbatim. Never cleaned up on the way in: if it read
  -- "Fuctions" the student sees "Fuctions" and knows not to trust the line.
  -- Silently correcting it would hide exactly the signal that matters.
  course_name     text,
  course_code     text,
  teacher         text,
  mark            numeric(8,3),
  out_of          numeric(8,3) check (out_of is null or out_of > 0),
  letter          text,
  term            text,
  remark          text,

  -- 0..1, the model's own claim about itself. Shown, sorted on, and never
  -- used to skip the confirmation step.
  confidence      numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  -- The whole extracted object, so a line can be re-read later without the
  -- original document, and so a bad extraction can be diagnosed after the fact.
  raw             jsonb not null default '{}'::jsonb,

  -- Which existing class this line looks like. A suggestion, not a decision:
  -- the student can change it, and 'pending' means nobody has agreed yet.
  matched_class_id uuid references classes on delete set null,
  decision        text not null default 'pending'
                  check (decision in ('pending','accept','skip')),

  -- What this line became once accepted. `set null` because deleting the mark
  -- must not delete the record that it was proposed -- and because it makes
  -- applying idempotent: a line that already has a grade is not applied twice.
  grade_id        uuid references grades on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column report_card_lines.decision is
  'pending until the student says. Never pre-set to accept, however confident '
  'the model was: a model''s certainty is not evidence, and this is a '
  'transcript.';

create index if not exists report_card_lines_card_idx
  on report_card_lines (report_card_id, confidence nulls first);
create index if not exists report_card_lines_owner_idx
  on report_card_lines (owner_id);

drop trigger if exists report_card_lines_touch on report_card_lines;
create trigger report_card_lines_touch before update on report_card_lines
  for each row execute function set_updated_at();

-- ------------------------------------------------------------------ rls ----

alter table report_cards      enable row level security;
alter table report_card_lines enable row level security;

-- Owner-only, all four verbs, both tables. Deliberately no parent arm and no
-- `has_share` arm. This is the only group of tables in the schema with no way
-- for a second person to read it, and that is the design.
drop policy if exists report_cards_all on report_cards;
create policy report_cards_all on report_cards for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists report_card_lines_all on report_card_lines;
create policy report_card_lines_all on report_card_lines for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    -- The line must hang off a report card you own. Without this, `owner_id`
    -- is a value you choose on a row you attach to somebody else's document.
    and exists (
      select 1 from report_cards rc
       where rc.id = report_card_lines.report_card_id
         and rc.owner_id = auth.uid()
    )
  );

grant select, insert, update, delete on report_cards      to authenticated;
grant select, insert, update, delete on report_card_lines to authenticated;
