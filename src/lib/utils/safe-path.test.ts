import { describe, expect, it } from "vitest";

import { safeLocalPath } from "./safe-path";

describe("safeLocalPath", () => {
  it("keeps a path on this site, with its query and hash", () => {
    expect(safeLocalPath("/staff/cases?filter=all#top")).toBe("/staff/cases?filter=all#top");
    expect(safeLocalPath("/dashboard")).toBe("/dashboard");
  });

  it("refuses anything that leaves the site", () => {
    for (const value of [
      "//evil.com",
      "/\\evil.com",
      "/\\/evil.com",
      "\\\\evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "evil.com",
      ".evil.com",
      "@evil.com",
    ]) {
      expect(safeLocalPath(value), value).toBeNull();
    }
  });

  it("refuses an empty value", () => {
    expect(safeLocalPath(null)).toBeNull();
    expect(safeLocalPath("")).toBeNull();
  });
});
