-- ============================================================================
-- The bucket, and the rules that make it safe to put anything in it.
--
-- `files` and `file_links` have existed since the first migration and nothing
-- has ever written to them, because there was nowhere to put the bytes. This
-- adds that: one private bucket, used by note attachments and by report card
-- uploads, with access decided by the path rather than by the app remembering
-- to ask.
--
-- EVERY OBJECT LIVES UNDER ITS OWNER'S UID
--
--     <uid>/notes/<uuid>.<ext>
--     <uid>/report-cards/<uuid>.<ext>
--
-- and the policies below check `(storage.foldername(name))[1] = auth.uid()`.
-- That is the whole control, and it is worth being explicit about why it is
-- the path and not a lookup against `files`: an object can be uploaded before
-- its row exists, and a policy that depends on a row that is not there yet
-- either fails the upload or has to be written to allow orphans -- and a rule
-- that allows orphans allows anything.
--
-- PRIVATE, AND NOT BY POLICY ALONE
--
-- The bucket is created with `public = false`. In a public bucket the object
-- URL is readable by anyone who has it, RLS notwithstanding, because public
-- objects are served without going through these policies at all. A report
-- card in a public bucket is a report card on the open internet the moment its
-- URL is guessed or pasted. The app reads objects through signed URLs, which
-- expire.
--
-- SIZE, BECAUSE THE FREE TIER IS ONE GIGABYTE IN TOTAL
--
-- 10MB a file. Enough for a phone photo of a whiteboard or a scanned report
-- card, small enough that a hundred of them is a tenth of everything. Without
-- a limit the first person to upload a video ends storage for everybody, and
-- the failure would arrive as somebody else's upload silently not working.
--
-- The mime allowlist has a cost worth naming: an upload of an unlisted type is
-- refused by the storage API, and the refusal is a 400 that means nothing to
-- the person holding the phone. Both `image/heic` and `image/heif` are listed
-- because iPhones produce either depending on version, and getting that wrong
-- would reject the single most likely upload in the whole app. The UI has to
-- say what is accepted *before* the picker opens, not after the failure.
--
-- IF THIS FILE FAILS TO APPLY
--
-- `storage.objects` is owned by `supabase_storage_admin`, not by the role that
-- runs migrations. On Supabase's hosted platform `postgres` can still create
-- policies on it and this applies cleanly. If it ever raises "must be owner of
-- table objects", nothing here is lost: create the same four rules under
-- Storage -> Policies in the dashboard, which runs as the owning role. The
-- bucket insert above is unaffected either way.
-- ============================================================================

-- Idempotent, and it means the bucket does not have to be created by hand in
-- the dashboard. `on conflict do nothing` rather than an upsert: if the bucket
-- already exists with settings somebody chose deliberately, this must not
-- reach in and change them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,
  10485760,
  array[
    'image/png','image/jpeg','image/webp','image/heic','image/heif','image/gif',
    'application/pdf',
    'text/plain','text/csv'
  ]
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Four policies, one per verb, all saying the same thing: the first folder in
-- the object's path must be your own user id.
--
-- `to authenticated` matters. Without it these also apply to `anon`, where
-- auth.uid() is null -- and `null = null` is null, not true, so anonymous
-- access would be refused anyway. It is stated because relying on a
-- three-valued-logic accident to enforce privacy is not enforcement, it is
-- luck that happens to hold.
-- ---------------------------------------------------------------------------

drop policy if exists calenda_attachments_select on storage.objects;
create policy calenda_attachments_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists calenda_attachments_insert on storage.objects;
create policy calenda_attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Both halves. `using` decides which rows you may attempt to change; `with
-- check` decides what they may become. Without the second, an update could
-- move your own object to a path under somebody else's uid, and from then on
-- it is theirs -- readable by them and no longer by you.
drop policy if exists calenda_attachments_update on storage.objects;
create policy calenda_attachments_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists calenda_attachments_delete on storage.objects;
create policy calenda_attachments_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
