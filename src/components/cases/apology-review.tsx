"use client";

import { useState, useTransition } from "react";
import { CheckIcon as Check, ArrowSquareOutIcon as ExternalLink, EyeIcon as Eye, CircleNotchIcon as Loader2, ArrowCounterClockwiseIcon as RotateCcw, XIcon as X } from "@phosphor-icons/react/ssr";
import { toast } from "sonner";

import { getApologyFileUrl, reviewApologyLetter } from "@/app/staff/cases/actions";
import { Button } from "@/components/ui/button";

type Decision = "accept" | "request_revision" | "reject";

const DECISION_COPY: Record<Decision, { label: string; prompt: string }> = {
  accept: {
    label: "Accept & close case",
    prompt: "Anything to add for the record? (optional)",
  },
  request_revision: {
    label: "Ask for changes",
    prompt: "What should the student change? They see this word for word.",
  },
  reject: {
    label: "Not accepted",
    prompt: "Why is this letter not acceptable? The student sees this.",
  },
};

export function ApologyReviewControls({ letterId }: { letterId: string }) {
  const [pending, setPending] = useState<Decision | null>(null);
  const [isPending, startTransition] = useTransition();

  if (pending) {
    const copy = DECISION_COPY[pending];
    return (
      <form
        action={(formData) =>
          startTransition(async () => {
            const result = await reviewApologyLetter(formData);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success(result.message ?? "Saved.");
            setPending(null);
          })
        }
        className="mt-2 space-y-2 rounded-lg border border-border p-3"
      >
        <input type="hidden" name="letter_id" value={letterId} />
        <input type="hidden" name="decision" value={pending} />

        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{copy.label}</p>
          <button
            type="button"
            onClick={() => setPending(null)}
            aria-label="Cancel"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <textarea
          name="notes"
          rows={3}
          maxLength={1000}
          required={pending !== "accept"}
          placeholder={copy.prompt}
          className="w-full min-h-10 rounded-md border border-border bg-background px-3 py-2 text-base focus:border-tup-maroon-600 focus:outline-none focus:ring-3 focus:ring-tup-maroon-600/20"
        />

        {pending === "accept" && (
          <p className="text-sm text-muted-foreground">
            Accepting closes the case on the counselling + apology path and notifies the
            student. It can&apos;t be undone from here.
          </p>
        )}

        <Button
          type="submit"
          disabled={isPending}
          className="w-full bg-tup-maroon-600 text-white hover:bg-tup-maroon-700"
        >
          {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Confirm
        </Button>
      </form>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => setPending("accept")}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-base font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
      >
        <Check className="h-4 w-4" />
        Accept & close
      </button>
      <button
        type="button"
        onClick={() => setPending("request_revision")}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-base font-medium transition-colors hover:bg-muted"
      >
        <RotateCcw className="h-4 w-4" />
        Ask for changes
      </button>
      <button
        type="button"
        onClick={() => setPending("reject")}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-base font-medium transition-colors hover:bg-muted"
      >
        <X className="h-4 w-4" />
        Not accepted
      </button>
    </div>
  );
}

/** Same two-step pattern as document review: fetch, then offer the link. */
export function ApologyFileLink({ letterId }: { letterId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm font-medium text-tup-maroon-600 underline-offset-2 hover:underline"
      >
        <ExternalLink className="h-4 w-4" />
        Open signed copy (5 min link)
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await getApologyFileUrl(letterId);
          if (result.error || !result.url) {
            toast.error(result.error ?? "Could not open that file.");
            return;
          }
          setUrl(result.url);
        })
      }
      className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
      View attached scan
    </button>
  );
}
