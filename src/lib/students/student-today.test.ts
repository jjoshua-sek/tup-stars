import { describe, expect, it } from "vitest";

import { studentTasks, type StudentCase } from "./student-today";

const now = new Date("2026-11-01T02:00:00Z");
const base = {
  cases: [] as StudentCase[],
  hearings: [],
  idStatus: "validated" as string | null,
  now,
  formatWhen: (iso: string) => `when(${iso.slice(0, 10)})`,
  formatDay: (iso: string) => `day(${iso.slice(0, 10)})`,
};

const kase = (overrides: Partial<StudentCase>): StudentCase => ({
  case_number: "OSA-2026-0001",
  status: "filed",
  apology_letters: [],
  case_settlements: [],
  case_appeals: [],
  ...overrides,
});

describe("studentTasks", () => {
  it("is empty for a student with nothing to do", () => {
    expect(studentTasks(base)).toEqual([]);
  });

  it("asks to confirm the soonest unconfirmed summons, and ignores past ones", () => {
    const tasks = studentTasks({
      ...base,
      hearings: [
        { status: "student_notified", scheduled_start: "2026-11-09T01:00:00Z" },
        { status: "student_notified", scheduled_start: "2026-11-05T01:00:00Z" },
        { status: "student_notified", scheduled_start: "2026-10-15T01:00:00Z" },
        { status: "confirmed", scheduled_start: "2026-11-03T01:00:00Z" },
      ],
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ urgent: true, href: "/appointments" });
    expect(tasks[0].text).toContain("when(2026-11-05)");
  });

  it("asks for an apology letter only while none is waiting or accepted", () => {
    const due = kase({ status: "awaiting_apology" });
    expect(studentTasks({ ...base, cases: [due] })[0].text).toBe("Case OSA-2026-0001 needs your written apology letter.");
    const sent = kase({ status: "awaiting_apology", apology_letters: [{ review_status: "pending" }] });
    expect(studentTasks({ ...base, cases: [sent] })).toEqual([]);
    const revise = kase({ status: "awaiting_apology", apology_letters: [{ review_status: "revision_requested" }] });
    expect(studentTasks({ ...base, cases: [revise] })).toHaveLength(1);
  });

  it("lists an unsigned settlement and an open appeal window, but nothing on a closed case", () => {
    const open = kase({
      status: "in_mediation",
      case_settlements: [{ student_signed_at: null }],
      case_appeals: [{ status: "window_open", appeal_deadline: "2026-11-10" }],
    });
    expect(studentTasks({ ...base, cases: [open] }).map((t) => t.key)).toEqual(["settlement-OSA-2026-0001", "appeal-OSA-2026-0001"]);
    expect(studentTasks({ ...base, cases: [{ ...open, status: "closed" }] })).toEqual([]);
  });

  it("puts a suspended ID first, and an unvalidated one last", () => {
    const due = kase({ status: "awaiting_apology" });
    expect(studentTasks({ ...base, cases: [due], idStatus: null }).map((t) => t.key)).toEqual(["apology-OSA-2026-0001", "id"]);
    expect(studentTasks({ ...base, idStatus: "suspended" })[0]).toMatchObject({ key: "id", urgent: true });
    expect(studentTasks({ ...base, idStatus: "pending" })[0].text).toMatch(/^Your ID validation request is waiting/);
  });
});
