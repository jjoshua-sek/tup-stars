"use client";

import { useState, useTransition } from "react";
import { CircleNotchIcon as Loader2 } from "@phosphor-icons/react/ssr";
import { toast } from "sonner";

import { turnOffTwoStepFor } from "@/app/staff/accounts/actions";

/**
 * Turns off two-step sign-in for one account, by login ID, for someone who
 * lost their phone. Asks once more before doing it.
 */
export function TwoStepResetForm() {
  const [isPending, startTransition] = useTransition();
  const [loginId, setLoginId] = useState("");
  const [confirming, setConfirming] = useState(false);

  function submit(formData: FormData) {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    startTransition(async () => {
      const result = await turnOffTwoStepFor(formData);
      setConfirming(false);
      if (result.error) toast.error(result.error);
      else {
        toast.success(result.message ?? "Done.");
        setLoginId("");
      }
    });
  }

  return (
    <form action={submit} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <label htmlFor="two-step-login-id" className="block text-base font-medium">
          Login ID
        </label>
        <input
          id="two-step-login-id"
          name="login_id"
          required
          value={loginId}
          onChange={(event) => {
            setLoginId(event.target.value);
            setConfirming(false);
          }}
          placeholder="TUPM-XX-XXXX"
          className="h-10 w-48 rounded-md border border-border bg-background px-3 font-mono text-base uppercase focus:border-tup-maroon-600 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className={
          confirming
            ? "inline-flex h-10 items-center gap-1.5 rounded-md bg-destructive px-4 text-base font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
            : "inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-4 text-base font-medium hover:bg-muted disabled:opacity-50"
        }
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {confirming ? `Yes, turn it off for ${loginId.trim().toUpperCase() || "this account"}` : "Turn off two-step sign-in"}
      </button>
      {confirming && !isPending && (
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="inline-flex h-10 items-center rounded-md px-3 text-base text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
      )}
    </form>
  );
}
