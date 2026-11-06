"use client";

import { useTransition } from "react";
import { CircleNotchIcon as Loader2 } from "@phosphor-icons/react/ssr";
import { toast } from "sonner";

import { saveTerm } from "@/app/staff/settings/actions";
import { Button } from "@/components/ui/button";
import { SEMESTERS, type AcademicTerm } from "@/lib/access/term";

/**
 * The administrator sets the current semester and school year (migration
 * 00057). The school year is chosen from a list, not typed, so it cannot be
 * mistyped.
 */
export function TermForm({ current, schoolYears }: { current: AcademicTerm; schoolYears: string[] }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await saveTerm(formData);
          if (result.error) toast.error(result.error);
          else toast.success(result.message ?? "Saved.");
        })
      }
      className="flex flex-wrap items-end gap-3"
    >
      <label className="block space-y-1">
        <span className="text-base font-medium">Semester</span>
        <select id="semester" name="semester" defaultValue={current.semester} className={selectClass}>
          {SEMESTERS.map((semester) => (
            <option key={semester} value={semester}>
              {semester}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-base font-medium">School year</span>
        <select id="schoolYear" name="schoolYear" defaultValue={current.schoolYear} className={selectClass}>
          {schoolYears.map((year) => (
            <option key={year} value={year}>
              {year.replace("-", "–")}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={pending} className="h-10 bg-tup-maroon-600 text-base text-white hover:bg-tup-maroon-700">
        {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        Save the term
      </Button>
    </form>
  );
}

const selectClass =
  "h-10 rounded-md border border-border bg-background px-3 text-base focus:border-tup-maroon-600 focus:outline-none";
