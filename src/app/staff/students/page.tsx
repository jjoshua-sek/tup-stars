import type { Metadata } from "next";
import Link from "next/link";
import { CaretLeftIcon as ChevronLeft, CaretRightIcon as ChevronRight, MagnifyingGlassIcon as Search, UsersIcon as Users } from "@phosphor-icons/react/ssr";

import { EmptyState } from "@/components/osa/empty-state";
import { RestrictedNotice } from "@/components/osa/restricted-notice";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getStaffContext } from "@/lib/osa/staff-context";
import { recordAccess } from "@/lib/students/access";
import { DIRECTORY_COLUMNS } from "@/lib/students/columns";
import { YEAR_LEVELS, parsePage, parseYearLevel, searchTokens, tokenFilter } from "@/lib/students/search";
import { loose } from "@/lib/supabase/loose";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Student records",
};

const PAGE_SIZE = 25;

interface DirectoryRow {
  id: string;
  student_number: string;
  first_name: string;
  last_name: string;
  program: string;
  year_level: string;
  scholastic_status: string;
}

/**
 * The way into a student's record when you don't arrive from a case, a
 * clearance request or the risk queue.
 *
 * A plain GET form, so search works without client JavaScript and every
 * result page has a URL an officer can bookmark or send to a colleague.
 * Deliberately lists identity and enrolment only — the directory is a
 * finding aid, and each record's own page decides what its viewer may see.
 */
export default async function StaffStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; year?: string; page?: string }>;
}) {
  const staff = await getStaffContext();
  if (!staff || !recordAccess(staff)) {
    return (
      <RestrictedNotice
        title="Student records"
        audience="The student directory is open to OSA staff, guidance, the disciplinary committees, the Registrar and the Cashier."
      />
    );
  }

  const params = await searchParams;
  const query = (params.q ?? "").slice(0, 120);
  const tokens = searchTokens(query);
  const year = parseYearLevel(params.year);
  const page = parsePage(params.page);

  const supabase = await createClient();
  let request = loose(supabase)
    .from("students")
    .select(DIRECTORY_COLUMNS, { count: "exact" });

  for (const token of tokens) request = request.or(tokenFilter(token));
  if (year) request = request.eq("year_level", year);

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await request
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  if (error) console.error("[students] directory query failed", error);

  const students = (data as DirectoryRow[] | null) ?? [];
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = tokens.length > 0 || year !== null;

  const hrefFor = (target: number) => {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (year) next.set("year", year);
    if (target > 1) next.set("page", String(target));
    const qs = next.toString();
    return qs ? `/staff/students?${qs}` : "/staff/students";
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Staff", href: "/staff/dashboard" }, { label: "Student records" }]}
        title="Student records"
        description="Find a student by name, student number or program, then open their record."
      />

      <form method="get" className="mb-5 flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor="student-search" className="mb-1 block text-base font-medium">
            Name, student number or program
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="student-search"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="e.g. Dela Cruz, TUPM-24-0123, BSIT"
              className="h-11 w-full rounded-md border border-input bg-background pl-9 pr-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-tup-maroon-600/30"
            />
          </div>
        </div>

        <div>
          <label htmlFor="student-year" className="mb-1 block text-base font-medium">
            Year level
          </label>
          <select
            id="student-year"
            name="year"
            defaultValue={year ?? ""}
            className="h-11 rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-tup-maroon-600/30"
          >
            <option value="">All years</option>
            {YEAR_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="h-11 rounded-md bg-tup-maroon-600 px-5 text-base font-medium text-white hover:bg-tup-maroon-700 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-tup-maroon-600/40 focus-visible:ring-offset-2"
        >
          Find student
        </button>

        {filtered && (
          <Link
            href="/staff/students"
            className="h-11 content-center text-base font-medium text-tup-maroon-700 underline-offset-2 hover:underline"
          >
            Clear the search
          </Link>
        )}
      </form>

      {students.length === 0 ? (
        <EmptyState
          icon={Users}
          title={filtered ? "No students match" : "No students yet"}
          description={
            filtered
              ? "Try part of the surname, or the student number without the campus prefix."
              : "Students appear here once they sign in and complete their profile."
          }
        />
      ) : (
        <>
          <p className="mb-2 text-base text-muted-foreground">
            <span className="tabular-nums">{total}</span> student{total === 1 ? "" : "s"}
            {filtered ? " match" : ""}
            {pageCount > 1 && (
              <>
                {" "}
                · page <span className="tabular-nums">{page}</span> of{" "}
                <span className="tabular-nums">{pageCount}</span>
              </>
            )}
          </p>

          {/* A list rather than a table: the whole row opens the record. */}
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {students.map((student) => (
              <li key={student.id}>
                <Link
                  href={`/staff/students/${student.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-base">
                      <span className="text-lg font-semibold">
                        {student.last_name}, {student.first_name}
                      </span>
                      <span className="ml-2 whitespace-nowrap font-mono text-sm text-muted-foreground">
                        {student.student_number}
                      </span>
                    </span>
                    <span className="block text-base text-muted-foreground">
                      {student.program}, {student.year_level}
                      {" · "}
                      <span className={cn(student.scholastic_status !== "Regular" && "font-medium text-amber-800")}>
                        {student.scholastic_status}
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>

          {pageCount > 1 && (
            <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-base">
              {page > 1 ? (
                <Link href={hrefFor(page - 1)} className={cn(buttonVariants({ variant: "outline" }), "gap-1")}>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous page
                </Link>
              ) : (
                <span />
              )}
              {page < pageCount && (
                <Link href={hrefFor(page + 1)} className={cn(buttonVariants({ variant: "outline" }), "gap-1")}>
                  Next page <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
