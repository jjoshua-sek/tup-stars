"use client";

import { useEffect, useState } from "react";
import { CircleNotchIcon as Loader2, ShieldCheckIcon } from "@phosphor-icons/react/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordTwoStepChange } from "@/lib/accounts/account-actions";
import { createClient } from "@/lib/supabase/client";

type State =
  | { mode: "loading" }
  | { mode: "off" }
  | { mode: "setup"; factorId: string; qr: string; secret: string }
  | { mode: "on"; factorId: string; confirmOff: boolean };

/**
 * Settings → Two-step sign-in. Optional for every account. Turning it on
 * links an authenticator app (Google or Microsoft Authenticator) through a
 * QR code; from then on signing in also asks for its 6-digit code, and the
 * database refuses a session that has not given it (migration 00056).
 * The browser talks to Supabase Auth directly; recordTwoStepChange() writes
 * the change to the Activity history.
 */
export function TwoStepSettings({ offline = false }: { offline?: boolean }) {
  const [state, setState] = useState<State>({ mode: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void createClient()
      .auth.mfa.listFactors()
      .then(({ data }) => {
        if (cancelled) return;
        const verified = data?.totp.find((factor) => factor.status === "verified");
        setState(verified ? { mode: "on", factorId: verified.id, confirmOff: false } : { mode: "off" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function startSetup() {
    setBusy(true);
    const mfa = createClient().auth.mfa;
    // A setup started earlier and never finished would block a new one.
    const { data: existing } = await mfa.listFactors();
    for (const factor of existing?.all ?? []) {
      if (factor.status !== "verified") await mfa.unenroll({ factorId: factor.id });
    }
    const { data, error } = await mfa.enroll({ factorType: "totp", friendlyName: "STARS" });
    setBusy(false);
    if (error || !data) {
      toast.error("Two-step sign-in could not be set up. Try again in a moment.");
      return;
    }
    setCode("");
    setState({ mode: "setup", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirmSetup(factorId: string) {
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      toast.error("Type the 6 digits the app shows.");
      return;
    }
    setBusy(true);
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId, code: digits });
    if (error) {
      setBusy(false);
      setCode("");
      toast.error("That code didn't match. Codes change every 30 seconds: type the one the app shows now.");
      return;
    }
    await recordTwoStepChange();
    setBusy(false);
    setState({ mode: "on", factorId, confirmOff: false });
    toast.success("Two-step sign-in is on. Next time you sign in, have your phone ready.");
  }

  async function cancelSetup(factorId: string) {
    setBusy(true);
    await createClient().auth.mfa.unenroll({ factorId });
    setBusy(false);
    setState({ mode: "off" });
  }

  async function turnOff(factorId: string) {
    setBusy(true);
    const { error } = await createClient().auth.mfa.unenroll({ factorId });
    if (error) {
      setBusy(false);
      toast.error("Two-step sign-in could not be turned off. Sign out, sign in again with your code, and try again.");
      return;
    }
    await recordTwoStepChange();
    setBusy(false);
    setState({ mode: "off" });
    toast.success("Two-step sign-in is off. Signing in asks only for your password.");
  }

  if (offline) {
    return (
      <p className="text-base text-muted-foreground">
        Two-step sign-in can be turned on or off only on the online STARS, not on the offline copy.
      </p>
    );
  }

  if (state.mode === "loading") {
    return (
      <p className="flex items-center gap-2 text-base text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking…
      </p>
    );
  }

  if (state.mode === "off") {
    return (
      <div className="space-y-3">
        <p className="text-base">
          <span className="font-semibold">Off.</span> Signing in asks only for your password.
        </p>
        <Button onClick={startSetup} disabled={busy} className="h-10 text-base">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheckIcon className="mr-2 h-5 w-5" />}
          Turn on two-step sign-in
        </Button>
      </div>
    );
  }

  if (state.mode === "setup") {
    return (
      <div className="space-y-4">
        <ol className="list-decimal space-y-2 pl-5 text-base">
          <li>On your phone, install Google Authenticator or Microsoft Authenticator.</li>
          <li>In the app, add an account and scan this code.</li>
          <li>Type the 6-digit code the app shows for STARS, then press Turn on.</li>
        </ol>
        {/* The QR code is an SVG from Supabase; white behind it in both themes so phones can read it. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI from Supabase Auth */}
        <img src={state.qr} alt="QR code to scan with your authenticator app" className="h-44 w-44 rounded-lg bg-white p-2" />
        <p className="text-sm text-muted-foreground">
          Can&apos;t scan? Type this key in the app instead:{" "}
          <span className="break-all font-mono text-foreground">{state.secret}</span>
        </p>
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="two-step-setup-code" className="text-base">
            6-digit code
          </Label>
          <Input
            id="two-step-setup-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            className="h-11 text-center font-mono text-xl tracking-[0.3em]"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => confirmSetup(state.factorId)} disabled={busy} className="h-10 text-base">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Turn on
          </Button>
          <Button variant="outline" onClick={() => cancelSetup(state.factorId)} disabled={busy} className="h-10 text-base">
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-base">
        <ShieldCheckIcon className="h-5 w-5 text-green-700" aria-hidden="true" />
        <span>
          <span className="font-semibold">On.</span> Signing in asks for your password and the code from your
          authenticator app.
        </span>
      </p>
      {state.confirmOff ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base">Turn it off? Your password alone will open this account.</span>
          <Button variant="destructive" onClick={() => turnOff(state.factorId)} disabled={busy} className="h-10 text-base">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Yes, turn it off
          </Button>
          <Button
            variant="outline"
            onClick={() => setState({ ...state, confirmOff: false })}
            disabled={busy}
            className="h-10 text-base"
          >
            Keep it on
          </Button>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setState({ ...state, confirmOff: true })} className="h-10 text-base">
          Turn off two-step sign-in
        </Button>
      )}
    </div>
  );
}
