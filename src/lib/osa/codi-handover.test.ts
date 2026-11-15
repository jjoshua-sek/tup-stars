import { describe, expect, it } from "vitest";

import { handoverFromTimeline, handoverTimeProblem, manilaInputValue } from "./codi-handover";

const handover = (receivedBy: string, occurredAt: string) => ({
  event_type: "note_added",
  actor_label: "Test Officer",
  occurred_at: occurredAt,
  details: { kind: "codi_handover", received_by: receivedBy, received_at: "2026-11-15T06:30:00.000Z", codi_reference: "" },
});

describe("handoverFromTimeline", () => {
  it("is null when the case has not been handed over", () => {
    expect(
      handoverFromTimeline([
        { event_type: "case_filed", actor_label: "A", occurred_at: "2026-11-15T01:00:00Z", details: null },
        { event_type: "note_added", actor_label: "A", occurred_at: "2026-11-15T02:00:00Z", details: { text: "a note" } },
      ]),
    ).toBeNull();
  });

  it("reads the handover, and lets a later entry correct an earlier one", () => {
    const record = handoverFromTimeline([
      handover("Prof. Reyes", "2026-11-15T07:00:00Z"),
      handover("Prof. Santos", "2026-11-15T08:00:00Z"),
    ]);
    expect(record).toEqual({
      receivedBy: "Prof. Santos",
      receivedAt: "2026-11-15T06:30:00.000Z",
      codiReference: null,
      recordedBy: "Test Officer",
      recordedAt: "2026-11-15T08:00:00Z",
    });
  });
});

describe("manilaInputValue", () => {
  it("writes Manila wall-clock time for a datetime-local field", () => {
    expect(manilaInputValue(new Date("2026-11-15T06:05:00Z"))).toBe("2026-11-15T14:05");
    expect(manilaInputValue(new Date("2026-12-31T16:30:00Z"))).toBe("2027-01-01T00:30");
  });
});

describe("handoverTimeProblem", () => {
  const filed = new Date("2026-11-15T01:00:00Z");
  const now = new Date("2026-11-15T08:00:00Z");

  it("accepts a time between filing and now", () => {
    expect(handoverTimeProblem(new Date("2026-11-15T06:00:00Z"), filed, now)).toBeNull();
  });

  it("refuses the future and anything before filing", () => {
    expect(handoverTimeProblem(new Date("2026-11-15T09:00:00Z"), filed, now)).toMatch(/future/);
    expect(handoverTimeProblem(new Date("2026-11-14T23:00:00Z"), filed, now)).toMatch(/before the case/);
  });
});
