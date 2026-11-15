import "server-only";

import type { StaffContext } from "@/lib/osa/staff-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { loose } from "@/lib/supabase/loose";
import { createClient } from "@/lib/supabase/server";

import { handoverFromTimeline, type HandoverRecord } from "./codi-handover";

/**
 * Who may open a confidential case's handover sheet.
 *
 * A CODI case is invisible to the OSA by RLS (migration 00013): only staff
 * cleared for confidential matters see it. But the officer who filed it, or
 * referred it, is the one who carries it to CODI, and loses sight of it the
 * moment it turns confidential. So the sheet opens for:
 *
 *   - cleared staff, whom the table's own policy lets read the case; and
 *   - the OSA officer who filed or referred that one case, and nobody else's.
 *
 * The second path reads with the server's key, so it is decided here and
 * nowhere else, and every opening is audited by the page.
 */

export interface HandoverAccess {
  /** Cleared for confidential cases: sees the whole history. */
  cleared: boolean;
  /** Filed or referred this case to CODI. */
  referrer: boolean;
}

async function referredCaseIds(staff: StaffContext, caseId?: string): Promise<Map<string, string>> {
  const db = loose(createAdminClient());
  let escalations = db
    .from("case_escalations")
    .select("case_id, escalated_at")
    .eq("escalated_to", "CODI")
    .eq("escalated_by", staff.staffId);
  let filings = db
    .from("case_timeline")
    .select("case_id, occurred_at")
    .eq("event_type", "case_filed")
    .eq("actor_id", staff.userId)
    .eq("details->>routed_to_codi", "true");
  if (caseId) {
    escalations = escalations.eq("case_id", caseId);
    filings = filings.eq("case_id", caseId);
  }
  const [{ data: escalated }, { data: filed }] = await Promise.all([escalations.limit(500), filings.limit(500)]);

  // case id → when it went to CODI
  const referred = new Map<string, string>();
  for (const row of (filed as Array<{ case_id: string; occurred_at: string }> | null) ?? []) {
    referred.set(row.case_id, row.occurred_at);
  }
  for (const row of (escalated as Array<{ case_id: string; escalated_at: string }> | null) ?? []) {
    referred.set(row.case_id, row.escalated_at);
  }
  return referred;
}

export async function codiHandoverAccess(staff: StaffContext, caseId: string): Promise<HandoverAccess | null> {
  const admin = loose(createAdminClient());
  const { data } = await admin
    .from("violation_cases")
    .select("id, confidentiality")
    .eq("id", caseId)
    .maybeSingle();
  const row = data as { id: string; confidentiality: string } | null;
  if (!row || row.confidentiality !== "codi") return null;

  // Cleared staff: the RLS policy is the judge.
  const { data: visible } = await loose(await createClient())
    .from("violation_cases")
    .select("id")
    .eq("id", caseId)
    .maybeSingle();
  const cleared = Boolean(visible);
  const referrer = staff.isOsa && (await referredCaseIds(staff, caseId)).has(caseId);

  return cleared || referrer ? { cleared, referrer } : null;
}

export interface MyHandover {
  id: string;
  caseNumber: string;
  referredAt: string;
  handover: HandoverRecord | null;
}

/**
 * The confidential cases this officer filed or referred, newest first: the
 * case number, when it went, and whether the handover is recorded. No names,
 * no complaint: the officer already knows those, and the list may be on screen.
 */
export async function listMyCodiHandovers(staff: StaffContext): Promise<MyHandover[]> {
  if (!staff.isOsa) return [];
  const referred = await referredCaseIds(staff);
  if (referred.size === 0) return [];

  const admin = loose(createAdminClient());
  const ids = [...referred.keys()];
  const [{ data: cases }, { data: timeline }] = await Promise.all([
    admin.from("violation_cases").select("id, case_number").in("id", ids).eq("confidentiality", "codi"),
    admin
      .from("case_timeline")
      .select("case_id, event_type, details, actor_label, occurred_at")
      .in("case_id", ids)
      .eq("event_type", "note_added")
      .eq("details->>kind", "codi_handover"),
  ]);

  const entries = (timeline as Array<{ case_id: string; event_type: string; details: unknown; actor_label: string | null; occurred_at: string }> | null) ?? [];
  return ((cases as Array<{ id: string; case_number: string }> | null) ?? [])
    .map((row) => ({
      id: row.id,
      caseNumber: row.case_number,
      referredAt: referred.get(row.id)!,
      handover: handoverFromTimeline(entries.filter((entry) => entry.case_id === row.id)),
    }))
    .sort((a, b) => b.referredAt.localeCompare(a.referredAt));
}
