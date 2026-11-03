-- ============================================================
-- 00055 — What a person may change on their own rows
-- ============================================================
-- A November 3, 2026 security review found three rules that let a signed-in
-- user change more than the app's own forms ever do. Anyone can send
-- requests to the database with their own session, skipping the forms, so
-- the database has to draw these lines itself:
--
--   1. students: "Students can update own record" (00001) allowed every
--      column. A student could set their own program, year level,
--      department, scholastic status or student number, which scholarship
--      eligibility and the reports read. The Registrar sets those; the
--      profile form never writes them. A trigger now refuses a change to
--      them unless it comes from staff, the administrator or the server
--      (no user session: account provisioning, the offline copy's sync).
--      When a student creates their own row (the profile form's first
--      save), the trigger fills those columns the way the form does: the
--      student number from the sign-in email, the program and year level
--      from the enrollment invitation, the rest as placeholders.
--
--   2. notifications: "update own notifications" (00013) allowed every
--      column. A user could rewrite a notice's text or its email delivery
--      status, which is the OSA's record that a summons was served, or set
--      it back to queued so the dispatch job sends it again and again and
--      uses up the day's email quota. A user may now change is_read and
--      read_at only; the dispatch job runs without a user session.
--
--   3. storage: a student could overwrite their own files in
--      academic-documents and case-documents, so a COR, rating slip or
--      apology letter could be swapped after the OSA checked it. The app
--      always uploads to a new path (upsert: false), so the two UPDATE
--      policies are dropped. Profile photos keep theirs: a new photo
--      replaces the old one at the same path.
--
-- Safe to run twice. To check afterwards, as a student in the app nothing
-- changes; and in the SQL editor:
--   SELECT tgname FROM pg_trigger
--    WHERE tgname IN ('students_lock_registrar_columns', 'notifications_owner_marks_read_only');
--   SELECT policyname FROM pg_policies WHERE schemaname = 'storage'
--      AND policyname IN ('student replaces own academic docs', 'own folder replaces case docs');
--   -- expect two triggers and no policies

-- ------------------------------------------------------------
-- 1. students: Registrar-set columns
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.students_lock_registrar_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  invited_program text;
  invited_year text;
BEGIN
  -- The server (no user session), staff and the administrator are not limited.
  IF auth.uid() IS NULL OR public.user_role() IN ('staff', 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT program, year_level INTO invited_program, invited_year
      FROM public.account_invitations
     WHERE user_id = auth.uid()
     LIMIT 1;

    NEW.user_id := auth.uid();
    NEW.student_number := upper(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1));
    NEW.campus := 'Manila';
    NEW.college := NULL;
    NEW.department := 'TBD';
    NEW.program := coalesce(invited_program, 'TBD');
    NEW.year_level := coalesce(invited_year, '1st Year');
    NEW.scholastic_status := 'Regular';
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.student_number IS DISTINCT FROM OLD.student_number
     OR NEW.campus IS DISTINCT FROM OLD.campus
     OR NEW.college IS DISTINCT FROM OLD.college
     OR NEW.department IS DISTINCT FROM OLD.department
     OR NEW.program IS DISTINCT FROM OLD.program
     OR NEW.year_level IS DISTINCT FROM OLD.year_level
     OR NEW.scholastic_status IS DISTINCT FROM OLD.scholastic_status
     OR NEW.qr_hash IS DISTINCT FROM OLD.qr_hash THEN
    RAISE EXCEPTION 'Your student number, college, program, year level and status are set by the Registrar. Ask the OSA to correct them.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS students_lock_registrar_columns ON public.students;
CREATE TRIGGER students_lock_registrar_columns
  BEFORE INSERT OR UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.students_lock_registrar_columns();

-- ------------------------------------------------------------
-- 2. notifications: owners mark read, nothing else
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notifications_owner_marks_read_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- The dispatch job and the offline copy's sync run without a user session.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'is_read' - 'read_at') IS DISTINCT FROM (to_jsonb(OLD) - 'is_read' - 'read_at') THEN
    RAISE EXCEPTION 'A notice can only be marked as read.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_owner_marks_read_only ON public.notifications;
CREATE TRIGGER notifications_owner_marks_read_only
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_owner_marks_read_only();

-- ------------------------------------------------------------
-- 3. storage: checked documents cannot be overwritten
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "student replaces own academic docs" ON storage.objects;
DROP POLICY IF EXISTS "own folder replaces case docs" ON storage.objects;
