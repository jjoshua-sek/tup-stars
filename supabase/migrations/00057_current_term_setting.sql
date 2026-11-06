-- ============================================================
-- 00057 — The current term, set by the administrator
-- ============================================================
-- Until now STARS worked out the term from the Manila calendar (August
-- starts the 1st Semester, January the 2nd, June the Summer). The real
-- calendar moves: a semester can start late or run long. The administrator
-- now sets the semester and school year in Settings, and every page, form
-- and check uses it: ID validation and the gate, the academic records forms,
-- the document checks, reports and the header. While these are null, the
-- calendar's term is used, as before (lib/settings/term.ts).
--
-- system_settings (00047) already lets every signed-in user read a setting
-- and only the administrator change one; these two rows join it.
--
-- Safe to run twice. To check afterwards:
--   SELECT key, value FROM public.system_settings WHERE key LIKE 'term_%';
--   -- expect term_semester and term_school_year, both null until set

INSERT INTO public.system_settings (key, value) VALUES
  ('term_semester', 'null'::jsonb),
  ('term_school_year', 'null'::jsonb)
ON CONFLICT (key) DO NOTHING;
