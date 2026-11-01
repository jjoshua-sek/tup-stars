"use client";

import { useTransition } from "react";
import { CircleNotchIcon as Loader2 } from "@phosphor-icons/react/ssr";
import { toast } from "sonner";

import { assignCaseOfficer } from "@/app/staff/cases/actions";
import { Button } from "@/components/ui/button";

/** The OSA head hands a restricted case to an officer (checklist A7). */
export function AssignOfficerForm({
  caseId,
  officers,
  current,
}: {
  caseId: string;
  officers: Array<{ id: string; full_name: string }>;
  current: string | null;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await assignCaseOfficer(formData);
          if (result.error) toast.error(result.error);
          else toast.success(result.message ?? "Assigned.");
        })
      }
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="case_id" value={caseId} />
      <label htmlFor={`officer-${caseId}`} className="sr-only">
        Assigned officer
      </label>
      <select
        id={`officer-${caseId}`}
        name="officer_id"
        defaultValue={current ?? ""}
        required
        className="h-10 rounded-md border border-border bg-background px-3 text-base focus:border-tup-maroon-600 focus:outline-none"
      >
        <option value="" disabled>
          Choose an officer
        </option>
        {officers.map((officer) => (
          <option key={officer.id} value={officer.id}>
            {officer.full_name}
          </option>
        ))}
      </select>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        Assign
      </Button>
    </form>
  );
}
