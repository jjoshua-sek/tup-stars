import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, createNonce } from "./csp";

const directive = (csp: string, name: string) =>
  csp.split("; ").find((part) => part.startsWith(`${name} `))?.split(" ").slice(1) ?? [];

describe("contentSecurityPolicy", () => {
  const csp = contentSecurityPolicy({ nonce: "abc123", supabaseUrl: "https://ref.supabase.co" });

  it("runs only scripts carrying this request's nonce", () => {
    expect(directive(csp, "script-src")).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(csp).not.toContain("unsafe-eval");
  });

  it("lets pages reach Supabase over HTTPS and its live updates over WSS", () => {
    expect(directive(csp, "connect-src")).toEqual(["'self'", "https://ref.supabase.co", "wss://ref.supabase.co"]);
    expect(directive(csp, "img-src")).toContain("https://ref.supabase.co");
  });

  it("blocks framing, plugins, other base URLs and forms posting elsewhere", () => {
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
    expect(directive(csp, "form-action")).toEqual(["'self'"]);
  });

  it("allows eval and the reload socket only in development", () => {
    const dev = contentSecurityPolicy({ nonce: "n", supabaseUrl: "http://localhost:54321", dev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toEqual(["'self'", "http://localhost:54321", "ws://localhost:54321", "ws:"]);
  });

  it("leaves Supabase out when its address is missing or unreadable", () => {
    expect(directive(contentSecurityPolicy({ nonce: "n" }), "connect-src")).toEqual(["'self'"]);
    expect(directive(contentSecurityPolicy({ nonce: "n", supabaseUrl: "not a url" }), "connect-src")).toEqual(["'self'"]);
  });
});

describe("createNonce", () => {
  it("is different every time", () => {
    expect(createNonce()).not.toBe(createNonce());
  });
});
