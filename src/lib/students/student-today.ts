/**
 * The "Needs your attention" list on the student dashboard: what the OSA is
 * waiting on from this student, as plain sentences with one button each.
 * Pure, so the wording and the rules are tested without a database.
 */

import { CASE_STATUS_META, type CaseStatus } from "@/types/osa";

export interface StudentCase {
  case_number: string;
  status: CaseStatus;
  apology_letters: Array<{ review_status: string }> | null;
  case_settlements: Array<{ student_signed_at: string | null }> | null;
  case_appeals: Array<{ status: string; appeal_deadline: string }> | null;
}

export interface StudentHearing {
  status: string;
  scheduled_start: string;
}

export interface StudentTask {
  key: string;
  text: string;
  action: string;
  href: string;
  /** Urgent tasks come first and are marked in red. */
  urgent: boolean;
}

/** Statuses after which a summons is still live but not yet confirmed. */
const AWAITING_CONFIRMATION = "student_notified";

export function studentTasks(input: {
  cases: StudentCase[];
  hearings: StudentHearing[];
  /** This term's ID validation status, or null when never requested. */
  idStatus: string | null;
  now: Date;
  /** Formats a date for the sentences (Manila time); passed in so tests stay simple. */
  formatWhen: (iso: string) => string;
  formatDay: (iso: string) => string;
}): StudentTask[] {
  const tasks: StudentTask[] = [];
  const nowMs = input.now.getTime();

  // A summons the student has not confirmed, soonest first.
  const toConfirm = input.hearings
    .filter((h) => h.status === AWAITING_CONFIRMATION && new Date(h.scheduled_start).getTime() > nowMs)
    .sort((a, b) => Date.parse(a.scheduled_start) - Date.parse(b.scheduled_start));
  if (toConfirm.length > 0) {
    tasks.push({
      key: "confirm-meeting",
      text: `You have a meeting with the OSA on ${input.formatWhen(toConfirm[0].scheduled_start)}. Confirm that you received the summons.`,
      action: "See my appointments",
      href: "/appointments",
      urgent: true,
    });
  }

  for (const c of input.cases) {
    if (CASE_STATUS_META[c.status]?.isTerminal) continue;
    const letters = c.apology_letters ?? [];
    const letterWaiting = letters.some((l) => l.review_status === "pending" || l.review_status === "accepted");
    if (c.status === "awaiting_apology" && !letterWaiting) {
      tasks.push({
        key: `apology-${c.case_number}`,
        text: `Case ${c.case_number} needs your written apology letter.`,
        action: "Write the letter",
        href: "/violations",
        urgent: true,
      });
    }
    if ((c.case_settlements ?? []).some((s) => !s.student_signed_at)) {
      tasks.push({
        key: `settlement-${c.case_number}`,
        text: `A settlement for case ${c.case_number} is waiting for you to read and accept it.`,
        action: "Read the settlement",
        href: "/violations",
        urgent: false,
      });
    }
    const appeal = (c.case_appeals ?? []).find((a) => a.status === "window_open");
    if (appeal) {
      tasks.push({
        key: `appeal-${c.case_number}`,
        text: `You may appeal the decision in case ${c.case_number} until ${input.formatDay(appeal.appeal_deadline)}.`,
        action: "See how to appeal",
        href: "/violations",
        urgent: false,
      });
    }
  }

  if (input.idStatus !== "validated") {
    tasks.push({
      key: "id",
      text:
        input.idStatus === "suspended" || input.idStatus === "revoked"
          ? "Your ID cannot open the campus gates right now. Please see the OSA in person."
          : input.idStatus === "pending" || input.idStatus === "under_review"
            ? "Your ID validation request is waiting. Bring your ID to the OSA window for this term's sticker."
            : "Your ID is not validated for this term yet. Bring it to the OSA window.",
      action: "Open Digital ID",
      href: "/id",
      urgent: input.idStatus === "suspended" || input.idStatus === "revoked",
    });
  }

  // Urgent first; otherwise in the order above.
  return [...tasks.filter((t) => t.urgent), ...tasks.filter((t) => !t.urgent)];
}
