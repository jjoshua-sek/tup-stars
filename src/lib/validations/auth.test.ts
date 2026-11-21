import { describe, expect, it } from "vitest";

import { loginSchema, staffLoginSchema } from "./auth";

const password = "Passw0rd!";

describe("sign-in IDs are exact", () => {
  it("accepts a staff ID only in capitals", () => {
    expect(staffLoginSchema.safeParse({ staff_id: "STAFF-26-0001", password }).success).toBe(true);
    for (const staff_id of ["staff-26-0001", "Staff-26-0001", "stAFF-26-0001", "STAFf-26-0001"]) {
      expect(staffLoginSchema.safeParse({ staff_id, password }).success, staff_id).toBe(false);
    }
  });

  it("accepts a student number only in capitals", () => {
    const ok = loginSchema.safeParse({ student_number: "TUPM-23-5047", password, birth_date: "2004-01-01" });
    expect(ok.success).toBe(true);
    for (const student_number of ["tupm-23-5047", "Tupm-23-5047", "TUPm-23-5047"]) {
      expect(loginSchema.safeParse({ student_number, password, birth_date: "2004-01-01" }).success, student_number).toBe(false);
    }
  });

  it("does not let one kind of ID through the other tab", () => {
    expect(staffLoginSchema.safeParse({ staff_id: "TUPM-23-5047", password }).success).toBe(false);
    expect(loginSchema.safeParse({ student_number: "STAFF-26-0001", password, birth_date: "2004-01-01" }).success).toBe(false);
  });

  it("drops only the spaces around an ID, never changes its letters", () => {
    const parsed = staffLoginSchema.safeParse({ staff_id: "  STAFF-26-0001 ", password });
    expect(parsed.success && parsed.data.staff_id).toBe("STAFF-26-0001");
  });
});
