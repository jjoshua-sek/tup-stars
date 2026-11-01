"use client";

import { useTransition } from "react";
import { CircleNotchIcon as Loader2 } from "@phosphor-icons/react/ssr";
import { toast } from "sonner";

import { classifyCase } from "@/app/staff/cases/actions";
import { Button } from "@/components/ui/button";

/**
 * The OSA classifies an offense the Student Manual does not list (checklist
 * A2). Manual offenses never show this: their type decides.
 */
export function ClassifyCaseForm({ caseId, current }: { caseId: string; current: "minor" | "major" | null }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await classifyCase(formData);
          if (result.error) toast.error(result.error);
          else toast.success(result.message ?? "Classified.");
        })
      }
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="case_id" value={caseId} />
      <label htmlFor={`classification-${caseId}`} className="sr-only">
        Classification
      </label>
      <select
        id={`classification-${caseId}`}
        name="classification"
        defaultValue={current ?? ""}
        required
        className="h-10 rounded-md border border-border bg-background px-3 text-base focus:border-tup-maroon-600 focus:outline-none"
      >
        <option value="" disabled>
          Choose minor or major
        </option>
        <option value="minor">Minor offense</option>
        <option value="major">Major offense</option>
      </select>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        {current ? "Change" : "Classify"}
      </Button>
    </form>
  );
}
