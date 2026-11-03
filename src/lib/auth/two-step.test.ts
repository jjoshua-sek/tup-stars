import { describe, expect, it } from "vitest";

import { aalFromAccessToken, hasTwoStep, needsSecondStep } from "./two-step";

/** A token-shaped string carrying these claims (unsigned: only read, never trusted). */
const token = (claims: Record<string, unknown>) =>
  `x.${btoa(JSON.stringify(claims)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.y`;

const app = { factor_type: "totp", status: "verified" };

describe("two-step sign-in", () => {
  it("reads the session's assurance level, aal1 when absent or unreadable", () => {
    expect(aalFromAccessToken(token({ aal: "aal2" }))).toBe("aal2");
    expect(aalFromAccessToken(token({ aal: "aal1" }))).toBe("aal1");
    expect(aalFromAccessToken(token({}))).toBe("aal1");
    expect(aalFromAccessToken("not-a-token")).toBe("aal1");
    expect(aalFromAccessToken(null)).toBe("aal1");
  });

  it("counts only a verified authenticator app as turned on", () => {
    expect(hasTwoStep([app])).toBe(true);
    expect(hasTwoStep([{ factor_type: "totp", status: "unverified" }])).toBe(false);
    expect(hasTwoStep([])).toBe(false);
    expect(hasTwoStep(undefined)).toBe(false);
  });

  it("asks for the code only when it is on and not yet given", () => {
    expect(needsSecondStep({ accessToken: token({ aal: "aal1" }), factors: [app] })).toBe(true);
    expect(needsSecondStep({ accessToken: token({ aal: "aal2" }), factors: [app] })).toBe(false);
    expect(needsSecondStep({ accessToken: token({ aal: "aal1" }), factors: [] })).toBe(false);
    // Half-finished setup (scanned but never confirmed) does not lock anyone out.
    expect(needsSecondStep({ accessToken: token({ aal: "aal1" }), factors: [{ factor_type: "totp", status: "unverified" }] })).toBe(false);
  });
});
