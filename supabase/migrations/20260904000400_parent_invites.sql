-- ============================================================================
-- Parent invites
--
-- Connecting a parent needs one side to find the other, but RLS deliberately
-- stops anyone reading another person's profile -- so neither side can look
-- the other up by email. A short-lived code solves it without weakening that:
-- the student generates one, the parent redeems it.
--
-- Redemption runs through a security-definer function rather than direct
-- table access, so a parent never gains read access to the invites table and
-- cannot enumerate codes.
-- ============================================================================

create table parent_invites (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references profiles on delete cascade,
  code        text not null unique,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  used_at     timestamptz,
  used_by     uuid references profiles on delete set null
);

create index parent_invites_student_idx on parent_invites (student_id, created_at desc);
-- Redemption looks a code up directly; only unused, unexpired ones matter.
create index parent_invites_open_idx on parent_invites (code) where used_at is null;

alter table parent_invites enable row level security;

-- A student manages their own invites. Nobody reads anyone else's -- including
-- the parent redeeming one, who goes through the function below instead.
create policy parent_invites_own on parent_invites for all
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

/**
 * Generates a code the student can pass to a parent.
 *
 * Codes are 8 characters from an alphabet with no 0/O/1/I, so they can be read
 * aloud or typed from a screenshot without ambiguity.
 */
create or replace function create_parent_invite()
returns text
language plpgsql security definer set search_path = public as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  new_code text;
  attempt  int := 0;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;

  -- Rate limit: a handful of open invites is plenty, and this stops a loop
  -- filling the table.
  if (select count(*) from parent_invites
      where student_id = auth.uid() and used_at is null and expires_at > now()) >= 5 then
    raise exception 'You already have several unused invite codes.';
  end if;

  loop
    attempt := attempt + 1;
    new_code := '';
    for _ in 1..8 loop
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    begin
      insert into parent_invites (student_id, code) values (auth.uid(), new_code);
      return new_code;
    exception when unique_violation then
      -- Astronomically unlikely; retry rather than fail.
      if attempt > 8 then raise exception 'Could not create an invite code.'; end if;
    end;
  end loop;
end;
$$;

/**
 * Redeems a code, linking the caller as a parent of the student who made it.
 *
 * Runs as the definer so the caller never needs read access to parent_invites.
 * Every failure returns the SAME message, so a wrong code cannot be told apart
 * from an expired or already-used one -- otherwise this becomes an oracle for
 * guessing codes.
 */
create or replace function redeem_parent_invite(invite_code text)
-- The OUT names are prefixed because plpgsql resolves bare `student_id`
-- to the output variable, which makes the ON CONFLICT column list below
-- ambiguous and fails at runtime.
returns table (out_student_id uuid, out_student_name text)
language plpgsql security definer set search_path = public as $$
declare
  invite parent_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;

  select * into invite
  from parent_invites
  where code = upper(trim(invite_code))
    and used_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'That code is not valid. Ask for a new one.';
  end if;

  if invite.student_id = auth.uid() then
    raise exception 'That code is not valid. Ask for a new one.';
  end if;

  insert into parent_links (parent_id, student_id, status, accepted_at)
  values (auth.uid(), invite.student_id, 'accepted', now())
  on conflict (parent_id, student_id)
  do update set status = 'accepted', accepted_at = now();

  update parent_invites
     set used_at = now(), used_by = auth.uid()
   where id = invite.id;

  -- The parent is now linked, so reading this profile is permitted.
  return query
    select p.id, p.full_name
    from profiles p
    where p.id = invite.student_id;
end;
$$;

revoke all on function create_parent_invite() from public;
revoke all on function redeem_parent_invite(text) from public;
grant execute on function create_parent_invite() to authenticated;
grant execute on function redeem_parent_invite(text) to authenticated;
