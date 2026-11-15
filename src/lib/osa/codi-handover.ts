import { manilaWallClock } from "@/lib/utils/time";

/**
 * The CODI handover: the moment the OSA turns a confidential case over to the
 * Committee on Decorum and Investigation. CODI runs its own proceedings, but
 * the case stays logged in STARS, and the handover itself is written into the
 * case's append-only history so who received it, and when, is on record.
 *
 * The history row is a `note_added` entry tagged with `details.kind`, which
 * the event_type CHECK of migration 00007 already allows.
 */

export const HANDOVER_KIND = "codi_handover";

export interface HandoverRecord {
  /** The CODI member or secretariat who took the case. */
  receivedBy: string;
  /** When they took it (ISO), as the officer entered it. */
  receivedAt: string;
  codiReference: string | null;
  /** Who recorded the handover in STARS, and when. */
  recordedBy: string;
  recordedAt: string;
}

interface TimelineRow {
  event_type: string;
  details: unknown;
  actor_label: string | null;
  occurred_at: string;
}

/** The latest handover in a case's history; a later entry corrects an earlier one. */
export function handoverFromTimeline(entries: ReadonlyArray<TimelineRow>): HandoverRecord | null {
  let latest: HandoverRecord | null = null;
  for (const entry of entries) {
    const details = entry.details as Record<string, unknown> | null;
    if (entry.event_type !== "note_added" || details?.kind !== HANDOVER_KIND) continue;
    if (typeof details.received_by !== "string" || typeof details.received_at !== "string") continue;
    if (latest && entry.occurred_at < latest.recordedAt) continue;
    latest = {
      receivedBy: details.received_by,
      receivedAt: details.received_at,
      codiReference: typeof details.codi_reference === "string" && details.codi_reference ? details.codi_reference : null,
      recordedBy: entry.actor_label ?? "Staff",
      recordedAt: entry.occurred_at,
    };
  }
  return latest;
}

/** A Manila wall-clock value for an <input type="datetime-local">: "2026-11-15T14:30". */
export function manilaInputValue(at: Date): string {
  const { year, month, day, minutes } = manilaWallClock(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month + 1)}-${pad(day)}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/**
 * Why a handover time cannot be right, or null when it can: not before the
 * case was filed, and not in the future (five minutes' grace for clocks).
 */
export function handoverTimeProblem(receivedAt: Date, filedAt: Date, now: Date): string | null {
  if (receivedAt.getTime() > now.getTime() + 5 * 60 * 1000) return "The handover time is in the future.";
  if (receivedAt.getTime() < filedAt.getTime() - 60 * 1000) return "The handover time is before the case was filed.";
  return null;
}

export const COMPLAINANT_LABELS: Record<string, string> = {
  faculty: "Faculty member",
  staff: "Staff member",
  student: "Student",
  osa_initiated: "The OSA, on its own initiative",
  external: "Someone outside TUP",
};
