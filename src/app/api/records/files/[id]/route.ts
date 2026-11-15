import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { loose } from "@/lib/supabase/loose";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/utils/audit";

const BUCKET = "academic-documents";

/**
 * Opens an academic document: GET /api/records/files/<id>, or with
 * ?copy=stamped the Registrar-stamped copy the OSA scanned at the counter.
 *
 * The row is read with the viewer's own session, so the table's RLS decides
 * (the student it belongs to, or staff). Only then is the link signed, with
 * the server's key: stamped scans are stored under stamped/<student>/, outside
 * the student's own folder, so the student's session could not sign it.
 * Each visit issues a link that lives a minute, as concern attachments do.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notFound = NextResponse.json({ error: "File not found." }, { status: 404 });
  if (!z.string().uuid().safeParse(id).success) return notFound;
  const stamped = new URL(request.url).searchParams.get("copy") === "stamped";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { data } = await loose(supabase)
    .from("academic_documents")
    .select("id, file_path, stamped_scan_path")
    .eq("id", id)
    .maybeSingle();
  const document = data as { id: string; file_path: string; stamped_scan_path: string | null } | null;
  // Someone else's document looks exactly like a missing one.
  const path = stamped ? document?.stamped_scan_path : document?.file_path;
  if (!document || !path) return notFound;

  const { data: signed, error } = await createAdminClient().storage.from(BUCKET).createSignedUrl(path, 60);
  if (error || !signed?.signedUrl) return notFound;

  await logAuditEvent(user.id, "file_download", `academic_documents/${document.id}${stamped ? "/stamped" : ""}`);

  const response = NextResponse.redirect(signed.signedUrl);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
