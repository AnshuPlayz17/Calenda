-- ============================================================================
-- `set_my_role()` has never worked, and every parent who signed up is a
-- student.
--
-- WHAT HAPPENS TODAY
--
--   select set_my_role('parent');
--   ERROR:  role may not be changed
--
-- Reproduced against a real Postgres with every migration applied in order.
-- The role is unchanged afterwards.
--
-- WHY
--
-- `guard_profile_role()` is a BEFORE UPDATE trigger on `profiles` that raises
-- unless the role change comes from a null `auth.uid()` (a migration, the SQL
-- editor, the service role) or from an admin. `set_my_role()` is SECURITY
-- DEFINER, and the assumption baked into the pair is that being a definer
-- function is enough to get past it.
--
-- It is not. SECURITY DEFINER changes the DATABASE ROLE a function executes as.
-- It does not touch `auth.uid()`, which reads `request.jwt.claim.sub` -- a
-- session setting that is still very much there inside the function. So the
-- trigger sees a signed-in non-admin and refuses, and the one path deliberately
-- built to write that column is the one path the guard blocks.
--
-- WHY NOBODY NOTICED
--
-- A student changes nothing. `handle_new_user()` already defaults the column to
-- 'student', so `set_my_role('student')` is `new.role is not distinct from
-- old.role` and the trigger never fires. Student sign-ups work perfectly.
-- Only a parent hits it -- and `applyDetails()` treats a failure here as a
-- warning rather than an error, on the entirely correct reasoning that an
-- account already exists by then. So it goes quiet.
--
-- This is the same failure the project has already had once: "everyone was
-- silently `student`". It was fixed for password sign-ups by asking the
-- question, and the answer has been thrown away ever since.
--
-- THE FIX, AND WHY IT DOES NOT OPEN ANYTHING
--
-- `set_my_role()` declares itself with a transaction-local setting that the
-- trigger recognises, and clears it immediately after its own update so it
-- cannot cover a second statement in the same transaction.
--
-- A client can call `set_config()` -- it is public -- so it is worth being
-- explicit that this is not the control and never was. The control is the
-- COLUMN GRANT: `rls.sql` revokes update on `profiles` and re-grants a named
-- list that deliberately omits `role`, and Postgres checks column privileges
-- BEFORE any policy or trigger runs. A client naming `role` in an update is
-- refused before this trigger is reached, flag or no flag. The trigger is the
-- second layer, and the second layer now lets through exactly one thing: a
-- function that refuses 'admin' by name and takes the row id from the token
-- rather than from an argument.
-- ============================================================================

create or replace function guard_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for the service role, a migration, and the Supabase SQL
  -- editor. Those are the only ways to bootstrap the very first admin, so they
  -- are allowed through -- there is no admin yet to authorise it.
  --
  -- This does not open a hole for anonymous clients: they also have a null
  -- uid, but the profiles_update policy requires id = auth.uid() or is_admin(),
  -- so their UPDATE matches no rows and never reaches this trigger.
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not is_admin()
     -- ...and it did not come from set_my_role(), which refuses 'admin' by
     -- name and edits only the caller's own row. Without this arm the guard
     -- blocks the single path that is supposed to write this column.
     and coalesce(current_setting('calenda.role_via_function', true), '') <> 'on'
  then
    raise exception 'role may not be changed';
  end if;
  return new;
end;
$$;

create or replace function set_my_role(new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A definer function runs as its owner, so it must establish for itself that
  -- there is a caller. Without this it would happily update nothing, which is
  -- harmless but hides a bug.
  if auth.uid() is null then
    raise exception 'set_my_role: no signed-in user';
  end if;

  -- The whole reason this function exists. 'admin' is not refused by omission
  -- somewhere else -- it is refused here, in the one place that can write the
  -- column, by name. Checked BEFORE the flag is set, so an invalid role never
  -- reaches a state where the guard would stand aside.
  if new_role is null or new_role not in ('student', 'parent') then
    raise exception 'set_my_role: role must be student or parent, got %', new_role;
  end if;

  -- Transaction-local (the third argument), and cleared immediately below, so
  -- it cannot cover any statement but the one it was set for.
  perform set_config('calenda.role_via_function', 'on', true);

  -- The id comes from the token, never from an argument, so there is no shape
  -- of call that edits somebody else's row.
  update profiles
     set role = new_role::user_role
   where id = auth.uid();

  perform set_config('calenda.role_via_function', '', true);
end;
$$;

revoke all on function set_my_role(text) from public;
grant execute on function set_my_role(text) to authenticated;
