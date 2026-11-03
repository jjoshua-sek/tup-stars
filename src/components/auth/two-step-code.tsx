"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleNotchIcon as Loader2, DeviceMobileIcon } from "@phosphor-icons/react/ssr";

import { announceSignOut } from "@/components/auth/session-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { safeLocalPath } from "@/lib/utils/safe-path";

/**
 * The second step of signing in, for an account that turned on two-step
 * sign-in (lib/auth/two-step.ts): the 6-digit code from the authenticator
 * app. Shown by the sign-in form right after the password, and by the
 * sign-in page when the proxy sends a half-signed-in session back here.
 * Without `onVerified` it continues to ?redirect= or `destination`.
 */
export function TwoStepCode({
  loginId,
  destination,
  onVerified,
}: {
  loginId: string;
  destination?: string;
  onVerified?: () => Promise<void> | void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError("Type the 6 digits the app shows.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp.find((f) => f.status === "verified");
    if (!factor) {
      setBusy(false);
      setError("This account's authenticator app could not be found. Ask the administrator to turn two-step sign-in off.");
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: digits });
    if (verifyError) {
      setBusy(false);
      setCode("");
      setError("That code didn't match. Codes change every 30 seconds: type the one the app shows now.");
      return;
    }
    if (onVerified) {
      await onVerified();
      setBusy(false);
      return;
    }
    router.replace(safeLocalPath(searchParams.get("redirect")) ?? destination ?? "/");
  }

  async function switchAccount() {
    await createClient().auth.signOut({ scope: "local" });
    announceSignOut();
    window.location.replace("/login");
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-6">
        <h3 className="mb-1.5 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <DeviceMobileIcon className="h-7 w-7 text-tup-maroon-600" aria-hidden="true" />
          Enter your code
        </h3>
        <p className="text-base text-muted-foreground">
          <span className="font-mono font-medium text-foreground">{loginId}</span> uses two-step sign-in. Open your
          authenticator app and type the 6-digit code for STARS.
        </p>
      </div>

      <form onSubmit={verify} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="two-step-code" className="text-base">
            6-digit code
          </Label>
          <Input
            id="two-step-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            autoFocus
            className="h-12 text-center font-mono text-2xl tracking-[0.4em]"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "two-step-error" : undefined}
          />
          {error && (
            <p id="two-step-error" role="alert" className="text-base text-destructive">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" disabled={busy} className="h-11 w-full text-base">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {busy ? "Checking..." : "Continue"}
        </Button>
      </form>

      <button
        type="button"
        onClick={switchAccount}
        className="mt-4 w-full rounded-md px-3 py-2 text-base text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        Use a different account
      </button>
      <p className="mt-4 text-sm text-muted-foreground">
        Lost your phone? Ask the administrator to turn off two-step sign-in for your account, then sign in with your
        password and set it up again.
      </p>
    </div>
  );
}
