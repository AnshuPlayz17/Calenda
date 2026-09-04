-- ============================================================================
-- Parent invite tests
--
-- Redeeming a code grants a parent standing access to a student's shared
-- content, so the ways it can be abused matter more than the happy path.
-- ============================================================================
\set QUIET on
set client_min_messages = warning;

create or replace function invite_tests_reset() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  delete from auth.users where email like '%@inv.test';
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000b1', 'student@inv.test'),
    ('00000000-0000-0000-0000-0000000000b2', 'parent@inv.test'),
    ('00000000-0000-0000-0000-0000000000b3', 'stranger@inv.test');
  update profiles set full_name = 'Test Student'
   where id = '00000000-0000-0000-0000-0000000000b1';
end;
$$;

create or replace function as_user(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
end;
$$;

select invite_tests_reset();
set client_min_messages = notice;

-- (1) Happy path ---------------------------------------------------------
do $$
declare code text; linked int; name text;
begin
  perform as_user('00000000-0000-0000-0000-0000000000b1');
  code := create_parent_invite();
  perform expect('a student can create an invite code', length(code), 8);

  perform as_user('00000000-0000-0000-0000-0000000000b2');
  select out_student_name into name from redeem_parent_invite(code);
  perform expect('a parent can redeem it', name, 'Test Student');

  select count(*) into linked from parent_links
   where parent_id = '00000000-0000-0000-0000-0000000000b2'
     and student_id = '00000000-0000-0000-0000-0000000000b1'
     and status = 'accepted';
  perform expect('the link is created and accepted', linked, 1);
end $$;

-- (2) A code is single use -----------------------------------------------
do $$
declare code text; ok boolean := false;
begin
  perform as_user('00000000-0000-0000-0000-0000000000b1');
  code := create_parent_invite();

  perform as_user('00000000-0000-0000-0000-0000000000b2');
  perform redeem_parent_invite(code);

  begin
    perform as_user('00000000-0000-0000-0000-0000000000b3');
    perform redeem_parent_invite(code);
  exception when others then ok := true;
  end;
  perform expect('a used code cannot be redeemed again', ok, true);
end $$;

-- (3) An expired code is refused -----------------------------------------
do $$
-- Named `the_code` rather than `code`: a local called `code` is ambiguous
-- against the column of the same name in the UPDATE below.
declare the_code text; ok boolean := false;
begin
  perform as_user('00000000-0000-0000-0000-0000000000b1');
  the_code := create_parent_invite();
  update parent_invites set expires_at = now() - interval '1 day'
   where parent_invites.code = the_code;

  begin
    perform as_user('00000000-0000-0000-0000-0000000000b3');
    perform redeem_parent_invite(the_code);
  exception when others then ok := true;
  end;
  perform expect('an expired code is refused', ok, true);
end $$;

-- (4) A guessed code is refused, and says nothing useful ------------------
do $$
declare msg text; ok boolean := false;
begin
  begin
    perform as_user('00000000-0000-0000-0000-0000000000b3');
    perform redeem_parent_invite('ZZZZZZZZ');
  exception when others then
    ok := true;
    get stacked diagnostics msg = message_text;
  end;
  perform expect('an unknown code is refused', ok, true);
  -- The same message for wrong, used and expired: otherwise the error tells an
  -- attacker which codes exist.
  perform expect('the error does not reveal why it failed',
                 msg, 'That code is not valid. Ask for a new one.');
end $$;

-- (5) A student cannot become their own parent ---------------------------
do $$
declare code text; ok boolean := false;
begin
  perform as_user('00000000-0000-0000-0000-0000000000b1');
  code := create_parent_invite();
  begin
    perform redeem_parent_invite(code);
  exception when others then ok := true;
  end;
  perform expect('a student cannot redeem their own code', ok, true);
end $$;

-- (6) Nobody can read anyone else's invites ------------------------------
do $$
declare n bigint;
begin
  perform expect(
    'a stranger cannot list invite codes',
    as_user_count('00000000-0000-0000-0000-0000000000b3',
                  'select count(*) from parent_invites'),
    0::bigint);
  perform expect(
    'a linked parent still cannot list invite codes',
    as_user_count('00000000-0000-0000-0000-0000000000b2',
                  'select count(*) from parent_invites'),
    0::bigint);
  n := as_user_count('00000000-0000-0000-0000-0000000000b1',
                     'select count(*) from parent_invites');
  perform expect('the student can see their own', n > 0, true);
end $$;

-- (7) Codes are unguessable enough ---------------------------------------
do $$
declare distinct_codes int;
begin
  perform as_user('00000000-0000-0000-0000-0000000000b1');
  delete from parent_invites where student_id = '00000000-0000-0000-0000-0000000000b1';
  -- Five is the per-student cap.
  for _ in 1..5 loop perform create_parent_invite(); end loop;
  select count(distinct code) into distinct_codes from parent_invites
   where student_id = '00000000-0000-0000-0000-0000000000b1';
  perform expect('generated codes are distinct', distinct_codes, 5);
end $$;

-- (8) The open-invite cap holds ------------------------------------------
do $$
declare ok boolean := false;
begin
  perform as_user('00000000-0000-0000-0000-0000000000b1');
  begin
    perform create_parent_invite();  -- sixth
  exception when others then ok := true;
  end;
  perform expect('a student cannot hoard invite codes', ok, true);
end $$;

select invite_tests_reset();
