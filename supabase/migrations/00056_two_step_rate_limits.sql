-- ============================================================
-- 00056 — Two-step sign-in, shared rate limits, retired messages
-- ============================================================
-- Items 6 and 7 of the November 3, 2026 security review.
--
--   1. Two-step sign-in. Anyone may turn on a second step in Settings: a
--      6-digit code from an authenticator app (Supabase Auth MFA, TOTP).
--      The app asks for the code after the password, but a stolen password
--      also works against the database directly, skipping the app. So for
--      an account that has turned it on, a session that has not given the
--      code (aal1) is refused by every table: one RESTRICTIVE policy per
--      table in public, plus storage.objects. Accounts without it are not
--      affected, and the server (service role) is never affected.
--      A table added later needs the same policy; the check at the end
--      lists any table without it.
--
--   2. Shared rate limits. Limits on scans, resets and uploads were kept in
--      each server's memory, so on Vercel a new server started counting
--      from zero. hit_rate_limit() counts in this table instead, in fixed
--      windows; only the server may call it. The app falls back to memory
--      if the call fails, so a limit never blocks everyone.
--
--   3. messages. The table from the first design has no rows and no page
--      uses it, but its rules still let any user send a message to anyone
--      and edit both sides of one. Browsers lose all access to it.
--
-- Safe to run twice. To check afterwards:
--   SELECT count(*) FROM pg_policies
--    WHERE policyname = 'two-step sign-in when turned on';        -- one per table
--   SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
--      AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public'
--                      AND p.tablename = c.relname AND p.policyname = 'two-step sign-in when turned on');
--   -- expect no rows
--   SELECT * FROM public.hit_rate_limit('check:00056', 2, 60);    -- allowed true, hits 1

-- The rate-limit table (section 2) is created first, so the loop in
-- section 1 gives it the same policy as every other table.
CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  key          text        NOT NULL,
  window_start timestamptz NOT NULL,
  hits         integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

-- No policies: only the server, which bypasses RLS, reads or writes it.
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_hits FROM anon, authenticated;

-- ------------------------------------------------------------
-- 1. Two-step sign-in
-- ------------------------------------------------------------
-- True unless this person turned on two-step sign-in and this session has
-- not given the code. Read once per query: policies call it as
-- (SELECT public.session_meets_two_step()).
CREATE OR REPLACE FUNCTION public.session_meets_two_step()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      OR auth.uid() IS NULL
      OR NOT EXISTS (
           SELECT 1 FROM auth.mfa_factors f
            WHERE f.user_id = auth.uid() AND f.status = 'verified'
         );
$$;

REVOKE ALL ON FUNCTION public.session_meets_two_step() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.session_meets_two_step() TO anon, authenticated, service_role;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'two-step sign-in when turned on', t.relname);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING ((SELECT public.session_meets_two_step())) WITH CHECK ((SELECT public.session_meets_two_step()))',
      'two-step sign-in when turned on', t.relname);
  END LOOP;
END;
$$;

-- Settings → Recent account activity also lists turning it on and off
-- (lib/accounts/activity.ts; the actions here must match that list).
DROP POLICY IF EXISTS "users read own account activity" ON public.audit_logs;
CREATE POLICY "users read own account activity" ON public.audit_logs
  FOR SELECT USING (
    user_id = auth.uid()
    AND action IN ('login', 'password_change', 'account_activated', 'password_reset_requested',
                   'two_step_turned_on', 'two_step_turned_off')
  );

DROP POLICY IF EXISTS "two-step sign-in when turned on" ON storage.objects;
CREATE POLICY "two-step sign-in when turned on" ON storage.objects
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.session_meets_two_step()))
  WITH CHECK ((SELECT public.session_meets_two_step()));

-- ------------------------------------------------------------
-- 2. Shared rate limits (the table is created at the top)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
RETURNS TABLE (allowed boolean, hits integer, reset_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  w timestamptz := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  n integer;
BEGIN
  INSERT INTO public.rate_limit_hits AS r (key, window_start, hits)
  VALUES (p_key, w, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET hits = r.hits + 1
  RETURNING r.hits INTO n;

  -- Old windows are cleared now and then rather than on a schedule.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_hits WHERE window_start < now() - interval '1 day';
  END IF;

  RETURN QUERY SELECT n <= p_limit, n, w + make_interval(secs => p_window_seconds);
END;
$$;

REVOKE ALL ON FUNCTION public.hit_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hit_rate_limit(text, integer, integer) TO service_role;

-- ------------------------------------------------------------
-- 3. messages: retired
-- ------------------------------------------------------------
REVOKE ALL ON public.messages FROM anon, authenticated;
