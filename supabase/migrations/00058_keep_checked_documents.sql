-- ============================================================
-- 00058 — A student cannot delete a document already on record
-- ============================================================
-- 00016 let a student delete any file in their own folder of the
-- academic-documents bucket. 00055 stopped them overwriting one; deleting
-- it was still possible, so a COR or rating slip the OSA had checked could
-- be made to disappear from under its verified figures.
--
-- The app deletes a student's file in one case only: the upload reached
-- storage but its academic_documents row was refused, and the form cleans
-- up the orphan (components/records/document-upload.tsx). The rule now
-- allows exactly that: a file in the student's own folder that no document
-- row points to. Staff keep their own rights; the server is unaffected.
--
-- Safe to run twice. To check afterwards:
--   SELECT policyname, qual FROM pg_policies
--    WHERE schemaname = 'storage' AND policyname = 'student deletes own academic docs';
--   -- the condition mentions academic_documents

DROP POLICY IF EXISTS "student deletes own academic docs" ON storage.objects;
CREATE POLICY "student deletes own academic docs" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'academic-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND NOT EXISTS (
      SELECT 1 FROM public.academic_documents d WHERE d.file_path = storage.objects.name
    )
  );
