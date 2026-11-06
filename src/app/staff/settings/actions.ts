"use server";

import { revalidatePath } from "next/cache";

import { getStaffContext } from "@/lib/osa/staff-context";
import { RETENTION_KEYS, readRetention, retentionSchema } from "@/lib/settings/retention";
import { TERM_KEYS, termSchema } from "@/lib/settings/term";
import { loose } from "@/lib/supabase/loose";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/utils/audit";
import { sanitizeText } from "@/lib/utils/sanitize";

interface Result {
  ok?: boolean;
  message?: string;
  error?: string;
}

/**
 * Records the retention periods the Data Protection Officer set (OSA
 * checklist I4), with the DPO's memo or reference. Administrators only;
 * the policy on system_settings enforces the same in the database.
 */
export async function saveRetention(formData: FormData): Promise<Result> {
  const staff = await getStaffContext();
  if (!staff?.isAdmin) return { error: "Only the administrator records retention changes, on the DPO's instruction." };

  const parsed = retentionSchema.safeParse({
    recordYears: formData.get("recordYears"),
    accessLogDays: formData.get("accessLogDays"),
    dpoReference: formData.get("dpoReference") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the values." };

  const db = loose(await createClient());
  const { data: before } = await db.from("system_settings").select("key, value");
  const previous = readRetention(before as Array<{ key: string; value: unknown }> | null);

  const now = new Date().toISOString();
  const rows = [
    [RETENTION_KEYS.recordYears, parsed.data.recordYears],
    [RETENTION_KEYS.accessLogDays, parsed.data.accessLogDays],
    [RETENTION_KEYS.dpoReference, sanitizeText(parsed.data.dpoReference, 120)],
  ] as const;
  for (const [key, value] of rows) {
    const { data, error } = await db
      .from("system_settings")
      .update({ value, updated_by: staff.staffId, updated_at: now })
      .eq("key", key)
      .select("key");
    if (error || ((data as unknown[] | null) ?? []).length === 0) {
      return {
        error: ["PGRST205", "42P01"].includes((error as { code?: string } | null)?.code ?? "")
          ? "Retention settings need migration 00047. Ask the administrator to run it."
          : "The retention settings could not be saved.",
      };
    }
  }

  await logAuditEvent(staff.userId, "retention_changed", "system_settings", {
    from: previous,
    to: parsed.data,
  });

  revalidatePath("/staff/settings");
  revalidatePath("/id");
  return { ok: true, message: "Retention updated. Students see the new periods from their next page load." };
}

/**
 * Sets the current semester and school year (migration 00057). Every page,
 * form and check uses it from the next page load: ID validation and the
 * gate, academic records, document checks, reports and the header.
 * Administrators only; the policy on system_settings enforces the same.
 */
export async function saveTerm(formData: FormData): Promise<Result> {
  const staff = await getStaffContext();
  if (!staff?.isAdmin) return { error: "Only the administrator sets the current term." };

  const parsed = termSchema.safeParse({
    semester: formData.get("semester"),
    schoolYear: formData.get("schoolYear"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the semester and school year." };

  const db = loose(await createClient());
  const now = new Date().toISOString();
  const rows = [
    [TERM_KEYS.semester, parsed.data.semester],
    [TERM_KEYS.schoolYear, parsed.data.schoolYear],
  ] as const;
  for (const [key, value] of rows) {
    const { data, error } = await db
      .from("system_settings")
      .update({ value, updated_by: staff.staffId, updated_at: now })
      .eq("key", key)
      .select("key");
    if (error || ((data as unknown[] | null) ?? []).length === 0) {
      return {
        error:
          ((data as unknown[] | null) ?? []).length === 0 && !error
            ? "The term setting needs migration 00057. Ask the administrator to run it."
            : "The term could not be saved.",
      };
    }
  }

  await logAuditEvent(staff.userId, "term_changed", "system_settings", parsed.data);
  // The term is read on every page; refresh them all.
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: `The current term is now ${parsed.data.semester}, AY ${parsed.data.schoolYear.replace("-", "–")}.`,
  };
}
