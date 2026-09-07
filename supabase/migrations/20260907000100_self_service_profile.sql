-- ============================================================================
-- Close the role escalation, and let a person set their own name and role.
--
-- THE HOLE
--
-- profiles_update was:
--
--   using       (id = auth.uid() or is_admin())
--   with check  (id = auth.uid() or is_admin())
--
-- Row-level, not column-level. So a signed-in user could write ANY column of
-- their own row, `role` included, from the browser:
--
--   supabase.from('profiles').update({ role: 'admin' }).eq('id', myUserId)
--
-- is_admin() is `select role = 'admin' from profiles where id = auth.uid()`,
-- and it gates nineteen of the fifty-four policies. That one line opened all
-- of them.
--
-- The init migration states the intent -- "created server-side so the client
-- never chooses its own role" -- and that is true of the trigger, which runs on
-- INSERT. Nobody closed UPDATE. The six adversarial tests did not catch it
-- because they *set* role = 'admin' as fixture setup and then check what an
-- admin cannot read; the escalation path itself was never under test. Two more
-- tests now cover it directly.
--
-- THE FIX
--
-- A user may still edit their own profile -- that is the point of this
-- migration, since nothing in the app could set a name or a role at all. But
-- the value they may put in `role` is constrained to the two a person may
-- honestly declare about themselves. 'admin' is not one of them, and only an
-- existing admin can grant it.
--
-- Written as WITH CHECK rather than a trigger deliberately: this project's rule
-- is that permission is enforced by policy, in the database, where it can be
-- read alongside the other fifty-four and attacked by the test file.
-- ============================================================================

drop policy if exists profiles_update on profiles;

create policy profiles_update on profiles for update
  using (id = auth.uid() or is_admin())
  with check (
    -- An admin may set anything, including granting or revoking admin.
    is_admin()
    -- Anyone else may only edit their own row, and may only declare themselves
    -- one of the two roles that carry no privilege over anybody else.
    or (id = auth.uid() and role in ('student', 'parent'))
  );

comment on policy profiles_update on profiles is
  'A user may edit their own profile but may only set role to student or parent. '
  'Granting admin requires an existing admin. See 20260907000100.';
