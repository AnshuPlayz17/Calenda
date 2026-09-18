-- ============================================================================
-- The rate limits, attacked.
--
-- A limiter is easy to write and easy to write uselessly. The three ways it
-- goes wrong are all checked here: it counts successes only (so guessing is
-- free), it is per-row rather than per-caller (so one account's limit is
-- another's), or the ceiling comes from the caller (so there is no ceiling).
-- ============================================================================
\set QUIET on
set client_min_messages = warning;

create or replace function rl_reset() returns void
language plpgsql security definer set search_path = public, auth as $$
declare y uuid;
begin
  delete from auth.users where email like '%@rl.test';
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000f1', 'teacher@rl.test'),
    ('00000000-0000-0000-0000-0000000000f2', 'student@rl.test'),
    ('00000000-0000-0000-0000-0000000000f3', 'other@rl.test');
  update profiles set role = 'teacher'
   where id = '00000000-0000-0000-0000-0000000000f1';

  select id into y from school_years where is_current limit 1;
  insert into teacher_groups (id, owner_id, school_year_id, name, join_code)
  values ('00000000-0000-0000-0000-00000000fa11',
          '00000000-0000-0000-0000-0000000000f1', y, 'Rate Limited 11', 'ZZZZZZZZ');
  delete from action_rates;
end;
$$;

create or replace function rl_as(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
end;
$$;

select rl_reset();
set client_min_messages = notice;

-- (1) A wrong guess costs a slot ---------------------------------------------
--
-- The whole point. A limiter that only counts successes makes every wrong
-- guess free, which is exactly the attack it exists to slow.
do $$
declare joined int := 0; i int; n int;
begin
  perform rl_as('00000000-0000-0000-0000-0000000000f2');
  for i in 1..25 loop
    select count(*) into n from redeem_group_join_code('QQQQQQQQ');
    joined := joined + n;
  end loop;

  perform expect('no wrong guess joined anything', joined, 0);
  perform expect('and every one of them was counted',
    (select count from action_rates
      where profile_id = '00000000-0000-0000-0000-0000000000f2' and action = 'join_group'),
    25);
end $$;

-- ...and now a code that IS real is refused too, because the allowance is
-- spent. That is the limit doing its job rather than the code being wrong.
do $$
declare n int;
begin
  perform rl_as('00000000-0000-0000-0000-0000000000f2');
  select count(*) into n from redeem_group_join_code('ZZZZZZZZ');
  perform expect('a real code returns nothing once the allowance is spent', n, 0);
  perform expect('and nobody was joined',
    (select count(*) from teacher_group_members
      where group_id = '00000000-0000-0000-0000-00000000fa11'),
    0::bigint);
end $$;

-- (2) The limit is per caller, not global ------------------------------------
--
-- If it were per row or global, one account exhausting it would lock out
-- everybody -- which is a denial of service wearing a limiter's clothes.
do $$
declare name text;
begin
  perform rl_as('00000000-0000-0000-0000-0000000000f3');
  select out_group_name into name from redeem_group_join_code('ZZZZZZZZ');
  perform expect('a different account is unaffected', name, 'Rate Limited 11');
end $$;

-- (3) The ceiling is not the caller's to choose ------------------------------
do $$
begin
  -- claim_action is revoked from public: a client cannot call it at all, so it
  -- cannot spend, reset, or raise its own allowance.
  perform expect('claim_action is not granted to authenticated',
    has_function_privilege('authenticated', 'claim_action(text, int)', 'execute'),
    false);
  perform expect('nor is the sweep',
    has_function_privilege('authenticated', 'sweep_action_rates()', 'execute'),
    false);
end $$;

-- (4) The counter table is unreachable from a client -------------------------
--
-- RLS on with no policies is default-deny. A client that could write this
-- table could set its own count to zero, which is not a limit.
do $$
begin
  perform expect('action_rates has row-level security on',
    (select relrowsecurity from pg_class where relname = 'action_rates'), true);
  perform expect('and no policies at all',
    (select count(*) from pg_policies where tablename = 'action_rates'), 0::bigint);
  perform expect('a client sees nothing in it',
    as_user_count('00000000-0000-0000-0000-0000000000f2',
      'select count(*) from action_rates'),
    0::bigint);
end $$;

-- (5) Ownership is checked before the limit ----------------------------------
--
-- Or somebody else's class could be used to burn your allowance: call rotate
-- on a class that is not yours thirty times, and your own rotations stop.
do $$
declare ok boolean := false; spent int;
begin
  perform rl_as('00000000-0000-0000-0000-0000000000f2');
  begin
    perform rotate_group_join_code('00000000-0000-0000-0000-00000000fa11');
  exception when others then ok := true;
  end;
  perform expect('a stranger cannot rotate the code', ok, true);

  select coalesce(sum(count), 0) into spent from action_rates
   where profile_id = '00000000-0000-0000-0000-0000000000f2' and action = 'rotate_code';
  perform expect('and the refusal cost them no allowance', spent, 0);
end $$;

select 'rate_limit_test: all assertions passed' as result;
