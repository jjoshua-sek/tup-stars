import "server-only";

import { cache } from "react";

import type { AcademicTerm } from "@/lib/access/term";
import { TERM_KEYS, readActiveTerm } from "@/lib/settings/term";
import { createAdminClient } from "@/lib/supabase/admin";
import { loose } from "@/lib/supabase/loose";

/**
 * The term in force: the administrator's setting, or the calendar's when it
 * is not set (lib/settings/term.ts). Read with the server key, so the gate's
 * routes (no user) and every page agree; once per request.
 */
export const getActiveTermInfo = cache(async (): Promise<{ term: AcademicTerm; setByAdmin: boolean }> => {
  try {
    const { data } = await loose(createAdminClient())
      .from("system_settings")
      .select("key, value")
      .in("key", [TERM_KEYS.semester, TERM_KEYS.schoolYear]);
    return readActiveTerm(data as Array<{ key: string; value: unknown }> | null);
  } catch {
    return readActiveTerm(null);
  }
});

export async function getActiveTerm(): Promise<AcademicTerm> {
  return (await getActiveTermInfo()).term;
}
