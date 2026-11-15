"use client";

import { useTransition } from "react";
import { CircleNotchIcon as Loader2, PrinterIcon as Printer } from "@phosphor-icons/react/ssr";
import { toast } from "sonner";

import { recordCodiHandover } from "@/app/staff/cases/actions";
import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog, where "Save as PDF" is also offered. */
export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()} className="gap-1.5 bg-tup-maroon-600 text-white hover:bg-tup-maroon-700">
      <Printer className="h-4 w-4" aria-hidden="true" />
      Print the handover sheet
    </Button>
  );
}

/** Records who at CODI received the case and when. Defaults to now, Manila time. */
export function CodiHandoverForm({
  caseId,
  defaultReceivedAt,
  correcting,
}: {
  caseId: string;
  /** "2026-11-15T14:30", Manila wall-clock. */
  defaultReceivedAt: string;
  /** A handover is already recorded; this adds a correction. */
  correcting: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await recordCodiHandover(formData);
          if (result.error) toast.error(result.error);
          else toast.success(result.message ?? "Handover recorded.");
        })
      }
      className="space-y-3"
    >
      <input type="hidden" name="case_id" value={caseId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-base font-medium">Received by (CODI)</span>
          <input name="received_by" required minLength={3} maxLength={120} placeholder="Full name and position" className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className="text-base font-medium">Date and time received</span>
          <input name="received_at" type="datetime-local" required defaultValue={defaultReceivedAt} className={inputClass} />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-base font-medium">CODI reference (optional)</span>
        <input name="codi_reference" maxLength={80} placeholder="e.g. CODI-2026-003" className={inputClass} />
      </label>
      <Button type="submit" disabled={isPending} className="bg-tup-maroon-600 text-white hover:bg-tup-maroon-700">
        {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        {correcting ? "Record a correction" : "Record the handover"}
      </Button>
    </form>
  );
}

const inputClass =
  "w-full min-h-11 rounded-md border border-border bg-background px-3 py-2 text-base focus:border-tup-maroon-600 focus:outline-none focus:ring-3 focus:ring-tup-maroon-600/20";
