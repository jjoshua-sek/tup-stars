-- ============================================================
-- 00059 — Staff sign in with STAFF-YY-NNNN, not a student number
-- ============================================================
-- Adviser feedback, November 2026: staff logins should not look like student
-- numbers. Staff accounts used placeholder numbers in the student format
-- (TUPM-26-0000) so one login form served everyone. The sign-in page now has
-- a "Staff" tab that asks for a staff ID, STAFF-YY-NNNN, so:
--
--   1. Every staff and administrator account whose sign-in address is a
--      student-style number is renamed: tupm-26-0001@tup.edu.ph becomes
--      staff-26-0001@tup.edu.ph. The digits stay, so TUPM-26-0001 is
--      STAFF-26-0001. The sign-in identity's copy of the address changes
--      with it. Passwords, two-step sign-in and sessions are untouched;
--      signed-in staff stay signed in.
--   2. staff.employee_id follows where it held the old ID.
--   3. account_invitations (where staff password-reset links are queued)
--      accepts a staff ID as well as a student number, and existing staff
--      rows there are renamed to match.
--
-- Student accounts are not touched: only rows whose user has a staff record.
--
-- The offline copy re-copies accounts from the cloud at each sync, so there
-- the rename arrives with the next sync; if this database may not write the
-- auth tables, step 1 is skipped with a notice instead of failing.
--
-- Safe to run twice. To check afterwards:
--   SELECT u.email, s.role_type FROM auth.users u JOIN public.staff s ON s.user_id = u.id ORDER BY 1;
--   -- every address starts with staff-
--   SELECT employee_id FROM public.staff ORDER BY 1;

-- 3 first, so the renamed invitation rows below pass the check.
ALTER TABLE public.account_invitations
  DROP CONSTRAINT IF EXISTS account_invitations_student_number_check;
ALTER TABLE public.account_invitations
  ADD CONSTRAINT account_invitations_student_number_check
  CHECK (student_number ~ '^(TUPM|STAFF)-\d{2}-\d{4}$');

UPDATE public.account_invitations i
   SET student_number = 'STAFF' || substr(i.student_number, 5)
  FROM public.staff s
 WHERE s.user_id = i.user_id
   AND i.student_number ~ '^TUPM-\d{2}-\d{4}$';

-- 2
UPDATE public.staff
   SET employee_id = 'STAFF' || substr(employee_id, 5)
 WHERE employee_id ~ '^TUPM-\d{2}-\d{4}$';

-- 1
DO $$
BEGIN
  UPDATE auth.users u
     SET email = 'staff' || substr(u.email, 5),
         updated_at = now()
    FROM public.staff s
   WHERE s.user_id = u.id
     AND u.email ~ '^tupm-\d{2}-\d{4}@tup\.edu\.ph$';

  UPDATE auth.identities i
     SET identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(u.email)),
         updated_at = now()
    FROM auth.users u
   WHERE u.id = i.user_id
     AND i.provider = 'email'
     AND u.email ~ '^staff-\d{2}-\d{4}@tup\.edu\.ph$'
     AND i.identity_data->>'email' IS DISTINCT FROM u.email;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE '00059: no rights on the auth tables here; staff sign-in addresses arrive with the next sync.';
END
$$;
