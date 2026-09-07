-- ============================================================================
-- One guarded way for a person to say whether they are a student or a parent.
--
-- FIRST, A CORRECTION TO 20260907000100
--
-- That migration was written in the belief that profiles_update let a client
-- write any column of its own row, role included, and that this was a
-- privilege escalation. It is not, and never was. Twelve lines below the
-- policy, the same rls.sql does:
--
--   revoke update on profiles from authenticated;
--   grant  update (full_name, avatar_url, grade, timezone, onboarded_at)
--     on profiles to authenticated;
--
-- Postgres checks column privileges before row-level security, so
-- `update profiles set role = 'admin'` from the anon key fails with
-- "permission denied for column role" and never reaches a policy at all. The
-- original author left a comment saying exactly that. The escalation was
-- reported from a partial read of the file.
--
-- 20260907000100 is therefore redundant rather than wrong, and it is kept
-- deliberately: it is a second layer, so that if role is ever added to the
-- column grant by someone who has forgotten why it was left out, the policy
-- still refuses a non-admin naming themselves admin. It is not the control.
-- The grant is the control.
--
-- WHY A FUNCTION AND NOT A GRANT
--
-- The sign-up form now asks whether you are a student or a parent, which has
-- to write that column. Adding `role` to the column grant would be the small
-- change, and it would undo a protection somebody put in on purpose and leave
-- one layer where there were two.
--
-- So the column stays ungranted and this is the only way through: a definer
-- function that decides for itself what it will accept. It cannot be talked
-- into 'admin' by any argument, and it writes to exactly one row -- the
-- caller's -- because the id is taken from the token rather than the caller.
--
-- Granting admin is deliberately not possible from any client, with or without
-- this. It is done in SQL by somebody who already has the database.
-- ============================================================================

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
  -- column, by name.
  if new_role is null or new_role not in ('student', 'parent') then
    raise exception 'set_my_role: role must be student or parent, got %', new_role;
  end if;

  -- The id comes from the token, never from an argument, so there is no shape
  -- of call that edits somebody else's row.
  update profiles
     set role = new_role::user_role
   where id = auth.uid();
end;
$$;

comment on function set_my_role(text) is
  'Lets a signed-in person declare themselves a student or a parent. The role '
  'column is not granted to clients; this is the only path, and it refuses '
  'admin by name. See 20260907000200.';

-- Not callable by anonymous visitors, and not by anything that has not signed
-- in. `public` would include both.
revoke all on function set_my_role(text) from public;
grant execute on function set_my_role(text) to authenticated;
