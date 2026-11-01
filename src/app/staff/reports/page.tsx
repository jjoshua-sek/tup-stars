import type { Metadata } from "next";
import { DownloadSimpleIcon as Download } from "@phosphor-icons/react/ssr";

import { RestrictedNotice } from "@/components/osa/restricted-notice";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentTerm } from "@/lib/access/term";
import { buildCollegeReport, totalRow } from "@/lib/osa/college-report";
import { loadCollegeReportInput } from "@/lib/osa/college-report-data";
import { getStaffContext } from "@/lib/osa/staff-context";
import { featuresToInputs, loadActiveRiskModel, loadRiskFeatures } from "@/lib/risk/load";
import { scoreStudent } from "@/lib/risk/score";
import { loose } from "@/lib/supabase/loose";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { APPLICATION_OPEN, CASE_STATUS_META, type CaseStatus } from "@/types/osa";

export const metadata: Metadata = {
  title: "Reports",
};

export const revalidate = 60;

/**
 * Term-level figures for the OSA's own reporting.
 *
 * Counts only — no names. A report that lists individuals gets forwarded
 * around campus; a report of totals answers the question ("how is the term
 * going?") without turning into a second, uncontrolled copy of the record.
 */
export default async function StaffReportsPage() {
  const staff = await getStaffContext();
  if (!staff || (!staff.isOsa && staff.role !== "osa_head")) {
    return (
      <RestrictedNotice
        title="Reports"
        audience="Reporting is available to OSA officers and the OSA head."
      />
    );
  }

  const supabase = await createClient();
  const db = loose(supabase);
  const term = getCurrentTerm();

  const termStart = new Date();
  termStart.setMonth(termStart.getMonth() - 5);
  const termStartIso = termStart.toISOString();

  const [
    { data: caseRows },
    { count: hearingCount },
    { count: studentCount },
    { count: clearanceOpen },
    { count: clearanceIssued },
    { count: validatedIds },
    { count: accessAllowed },
    { count: accessDenied },
    { count: openAnomalies },
    { count: scholarshipQueue },
    model,
    features,
  ] = await Promise.all([
    db.from("violation_cases").select("classification, status, created_at").limit(2000),
    db
      .from("case_hearings")
      .select("id", { count: "exact", head: true })
      .gte("scheduled_start", termStartIso),
    db.from("students").select("id", { count: "exact", head: true }),
    db
      .from("clearance_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["submitted", "verifying", "on_hold"]),
    db
      .from("clearance_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "issued"),
    db
      .from("id_validations")
      .select("id", { count: "exact", head: true })
      .eq("status", "validated")
      .eq("school_year", term.schoolYear)
      .eq("semester", term.semester),
    db
      .from("access_events")
      .select("id", { count: "exact", head: true })
      .eq("decision", "allow")
      .gte("occurred_at", termStartIso),
    db
      .from("access_events")
      .select("id", { count: "exact", head: true })
      .eq("decision", "deny")
      .gte("occurred_at", termStartIso),
    db
      .from("access_anomalies")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    db
      .from("scholarship_applications")
      .select("id", { count: "exact", head: true })
      .in("status", APPLICATION_OPEN),
    loadActiveRiskModel(db),
    loadRiskFeatures(db, { limit: 500 }),
  ]);

  const collegeRows = buildCollegeReport(await loadCollegeReportInput(db, term, termStartIso));

  const cases =
    (caseRows as Array<{ classification: string; status: CaseStatus; created_at: string }> | null) ??
    [];

  const openCases = cases.filter((row) => !CASE_STATUS_META[row.status]?.isTerminal);
  const minor = cases.filter((row) => row.classification === "minor").length;
  const major = cases.filter((row) => row.classification === "major").length;
  const thisTerm = cases.filter((row) => row.created_at >= termStartIso).length;

  const tiers = { low: 0, moderate: 0, high: 0, critical: 0 };
  if (model) {
    for (const row of features) {
      tiers[scoreStudent(featuresToInputs(row), model).risk_tier] += 1;
    }
  }

  const byStatus = new Map<CaseStatus, number>();
  for (const row of cases) {
    byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
  }

  const scans = (accessAllowed ?? 0) + (accessDenied ?? 0);

  return (
    <div className="space-y-8">
      <PageHeader
        breadcrumbs={[{ label: "Staff", href: "/staff/dashboard" }, { label: "Reports" }]}
        title="Reports"
        description={`Totals for ${term.label}. Figures only; open each page for names.`}
      >
        <a href="/staff/reports/export" className={cn(buttonVariants(), "gap-1.5 bg-tup-maroon-600 text-white hover:bg-tup-maroon-700")}>
          <Download className="h-4 w-4" /> Download all colleges (CSV)
        </a>
      </PageHeader>

      {/* Four short lists of figures rather than sixteen tiles. */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Figures
          title="Discipline"
          rows={[
            ["Cases filed this term", thisTerm],
            ["Cases still open", openCases.length, openCases.length > 0 ? "warning" : undefined],
            ["Minor cases, all time", minor],
            ["Major cases, all time", major],
            ["Hearings set this term", hearingCount ?? 0],
          ]}
        />
        <Figures
          title="Early warning"
          rows={[
            ["Rated critical", tiers.critical, tiers.critical > 0 ? "danger" : undefined],
            ["Rated high", tiers.high, tiers.high > 0 ? "warning" : undefined],
            ["Rated moderate", tiers.moderate],
            ["Students on file", studentCount ?? 0],
          ]}
        />
        <Figures
          title="Services"
          rows={[
            ["Clearance requests in progress", clearanceOpen ?? 0],
            ["Certificates issued", clearanceIssued ?? 0],
            ["Scholarship applications waiting", scholarshipQueue ?? 0],
            ["IDs validated this term", validatedIds ?? 0],
          ]}
        />
        <Figures
          title="Campus gates"
          rows={[
            ["Entries allowed this term", accessAllowed ?? 0],
            ["Scans refused this term", accessDenied ?? 0, (accessDenied ?? 0) > 0 ? "warning" : undefined],
            ["Share of scans refused", scans > 0 ? `${Math.round(((accessDenied ?? 0) / scans) * 100)}%` : "No scans yet"],
            ["Gate alerts still open", openAnomalies ?? 0, (openAnomalies ?? 0) > 0 ? "danger" : undefined],
          ]}
        />
      </div>

      {/* Per college (checklist I5) */}
      <section>
        <div className="mb-3">
          <h2 className="font-display text-lg font-semibold tracking-tight">By college</h2>
          <p className="text-base text-muted-foreground">
            Counts only. A college comes from the student&apos;s verified COR; without one, from their program.
            Each row has its own download.
          </p>
        </div>
        {collegeRows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-base text-muted-foreground">
            No students on file yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[760px] text-base tabular-nums">
              <thead className="border-b border-border bg-muted/40 text-left text-sm text-muted-foreground font-medium">
                <tr>
                  <th className="px-3 py-2 font-medium">College</th>
                  <th className="px-3 py-2 text-right font-medium">Students</th>
                  <th className="px-3 py-2 text-right font-medium">Cases (term)</th>
                  <th className="px-3 py-2 text-right font-medium">Open cases</th>
                  <th className="px-3 py-2 text-right font-medium">Concerns (term)</th>
                  <th className="px-3 py-2 text-right font-medium">IDs validated</th>
                  <th className="px-3 py-2 text-right font-medium">Clearances</th>
                  <th className="px-3 py-2 text-right font-medium">High risk</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...collegeRows, totalRow(collegeRows)].map((row) => {
                  const isTotal = row.college === "Total";
                  return (
                    <tr key={row.college} className={isTotal ? "bg-muted/30 font-semibold" : undefined}>
                      <td className="px-3 py-2">
                        {row.college}
                        {row.estimated > 0 && (
                          <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                            ({row.estimated} by program)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">{row.students}</td>
                      <td className="px-3 py-2 text-right">{row.casesThisTerm}</td>
                      <td className="px-3 py-2 text-right">{row.openCases}</td>
                      <td className="px-3 py-2 text-right">{row.concernsThisTerm}</td>
                      <td className="px-3 py-2 text-right">{row.idsValidated}</td>
                      <td className="px-3 py-2 text-right">{row.clearancesIssued}</td>
                      <td className="px-3 py-2 text-right">{row.highRisk}</td>
                      <td className="px-3 py-2 text-right">
                        {!isTotal && (
                          <a
                            href={`/staff/reports/export?college=${encodeURIComponent(row.college)}`}
                            className={csvLinkClass}
                            aria-label={`Download ${row.college} (CSV)`}
                          >
                            <Download className="h-4 w-4" /> Download
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Case pipeline */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">
          Cases by stage
        </h2>
        {byStatus.size === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-base text-muted-foreground">
            No cases on file yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <ul className="divide-y divide-border">
              {[...byStatus.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => {
                  const share = Math.round((count / cases.length) * 100);
                  return (
                    <li key={status} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-40 shrink-0 text-base sm:w-56">
                        {CASE_STATUS_META[status]?.label ?? status}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-tup-maroon-600"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                      <span className="w-12 shrink-0 text-right text-base font-semibold tabular-nums">
                        {count}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </div>
        )}
      </section>

      <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
        Risk tiers are computed live from the active model and reflect only students with
        data on file. Report them as a workload measure, not as a prediction of outcomes.
      </p>
    </div>
  );
}

const csvLinkClass =
  "inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-base font-medium text-tup-maroon-700 transition-colors hover:bg-muted";

type FigureTone = "warning" | "danger";

const FIGURE_TONE: Record<FigureTone, string> = {
  warning: "text-amber-800",
  danger: "text-red-700",
};

/** A titled list of figures: the label on the left, the number on the right. */
function Figures({ title, rows }: { title: string; rows: Array<[string, number | string, FigureTone?]> }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <h2 className="border-b border-border px-5 py-3 font-display text-lg font-semibold tracking-tight">{title}</h2>
      <dl className="divide-y divide-border">
        {rows.map(([label, value, tone]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 px-5 py-3">
            <dt className="text-base text-muted-foreground">{label}</dt>
            <dd className={cn("text-xl font-semibold tabular-nums", tone && FIGURE_TONE[tone])}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
