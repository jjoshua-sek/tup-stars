import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WarningIcon as AlertTriangle, CalendarCheckIcon as CalendarCheck } from "@phosphor-icons/react/ssr";

import { EmptyState } from "@/components/osa/empty-state";
import { ToneBadge } from "@/components/osa/tone-badge";
import { PageHeader } from "@/components/shared/page-header";
import {
  AGENDA_COLUMNS,
  manilaDay,
  needsAttention,
  upcomingAgenda,
  type AgendaEntry,
  type AgendaSources,
} from "@/lib/osa/agenda";
import { getStaffContext } from "@/lib/osa/staff-context";
import { loose } from "@/lib/supabase/loose";
import { createClient } from "@/lib/supabase/server";
import { formatManila, formatManilaTime, manilaInstant } from "@/lib/utils/time";

export const metadata: Metadata = {
  title: "Calendar",
};

export const dynamic = "force-dynamic";

const DAYS_AHEAD = 14;
/** How far back to look for things that passed unrecorded. */
const LOOKBACK_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

type StudentName = { first_name: string; last_name: string } | null;
const fullName = (student: StudentName) => (student ? `${student.first_name} ${student.last_name}` : null);

/**
 * The OSA calendar: hearings, guidance sessions, interventions and
 * deadlines for the next two weeks, and everything that passed without
 * being recorded. Read through the viewer's own session, so each role sees
 * what RLS lets it see — a counselor's sessions, an officer's cases.
 */
export default async function StaffCalendarPage() {
  const staff = await getStaffContext();
  if (!staff) redirect("/staff/dashboard");

  const now = new Date();
  const until = new Date(now.getTime() + DAYS_AHEAD * DAY_MS).toISOString();
  const since = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS).toISOString();
  const untilDay = manilaDay(new Date(now.getTime() + DAYS_AHEAD * DAY_MS));
  const sinceDay = manilaDay(new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS));

  const db = loose(await createClient());
  const [hearings, sessions, interventions, appeals, services, gateAlerts] = await Promise.all([
    db
      .from("case_hearings")
      .select(AGENDA_COLUMNS.case_hearings)
      .in("status", ["awaiting_complainant", "complainant_approved", "student_notified", "student_acknowledged", "confirmed"])
      .gte("scheduled_start", since)
      .lte("scheduled_start", until),
    db
      .from("guidance_sessions")
      .select(AGENDA_COLUMNS.guidance_sessions)
      .eq("status", "scheduled")
      .gte("scheduled_at", since)
      .lte("scheduled_at", until),
    db
      .from("risk_interventions")
      .select(AGENDA_COLUMNS.risk_interventions)
      .in("status", ["approved", "scheduled"])
      .gte("scheduled_for", since)
      .lte("scheduled_for", until),
    db
      .from("case_appeals")
      .select(AGENDA_COLUMNS.case_appeals)
      .eq("status", "window_open")
      .gte("appeal_deadline", sinceDay)
      .lte("appeal_deadline", untilDay),
    db
      .from("community_service_assignments")
      .select(AGENDA_COLUMNS.community_service_assignments)
      .in("status", ["assigned", "in_progress"])
      .gte("deadline", sinceDay)
      .lte("deadline", untilDay),
    // Open until handled, however old: no date window.
    db
      .from("access_anomalies")
      .select(AGENDA_COLUMNS.access_anomalies)
      .eq("anomaly_type", "scan_while_suspended")
      .eq("status", "open")
      .order("last_detected_at", { ascending: false })
      .limit(50),
  ]);

  for (const [name, result] of Object.entries({ hearings, sessions, interventions, appeals, services, gateAlerts })) {
    if (result.error) console.error(`[calendar] ${name} not loaded`, result.error);
  }

  type CaseEmbed = { case_number: string; students?: StudentName } | null;
  const rows = <T,>(result: { data: unknown }) => ((result.data as T[] | null) ?? []);

  const sources: AgendaSources = {
    hearings: rows<{
      id: string; case_id: string; hearing_type: string; scheduled_start: string; scheduled_end: string;
      venue: string; status: string; violation_cases: CaseEmbed;
    }>(hearings).map((h) => ({
      ...h,
      case_number: h.violation_cases?.case_number ?? null,
      student: fullName(h.violation_cases?.students ?? null),
    })),
    sessions: rows<{ id: string; scheduled_at: string | null; status: string; session_type: string; students: StudentName }>(
      sessions,
    ).map((s) => ({ ...s, student: fullName(s.students) })),
    interventions: rows<{
      id: string; scheduled_for: string | null; status: string; intervention_type: string; students: StudentName;
    }>(interventions).map((i) => ({ ...i, student: fullName(i.students) })),
    appeals: rows<{ id: string; case_id: string; appeal_deadline: string; status: string; violation_cases: CaseEmbed }>(
      appeals,
    ).map((a) => ({
      ...a,
      case_number: a.violation_cases?.case_number ?? null,
      student: fullName(a.violation_cases?.students ?? null),
    })),
    services: rows<{
      id: string; case_id: string; deadline: string | null; status: string; hours_required: number;
      hours_completed: number; violation_cases: CaseEmbed; students: StudentName;
    }>(services).map((s) => ({
      ...s,
      hours_completed: Number(s.hours_completed),
      case_number: s.violation_cases?.case_number ?? null,
      student: fullName(s.students),
    })),
    gateAlerts: rows<{
      id: string; details: { status?: string; gate_label?: string } | null; occurrence_count: number;
      last_detected_at: string; students: StudentName;
    }>(gateAlerts).map((a) => ({
      id: a.id,
      last_detected_at: a.last_detected_at,
      occurrence_count: a.occurrence_count,
      status: a.details?.status ?? null,
      gate_label: a.details?.gate_label ?? null,
      student: fullName(a.students),
    })),
  };

  const overdue = needsAttention(sources, now);
  const days = upcomingAgenda(sources, now, DAYS_AHEAD);
  const today = manilaDay(now);
  const tomorrow = manilaDay(new Date(now.getTime() + DAY_MS));

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Staff", href: "/staff/dashboard" }, { label: "Calendar" }]}
        title="Calendar"
        description="Hearings, counselling, follow-ups and deadlines for the next two weeks, and anything that passed without being recorded. Press any line to open it."
      />

      {overdue.length > 0 && (
        <section className="mb-8">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
            <AlertTriangle className="h-5 w-5 text-red-700" />
            Needs attention
            <span className="rounded-full bg-red-100 px-2 text-base font-normal tabular-nums text-red-800">{overdue.length}</span>
          </h2>
          <p className="mb-3 mt-0.5 text-base text-muted-foreground">
            These dates have passed and nothing was recorded. Oldest first.
          </p>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-red-200 bg-card">
            {overdue.map((entry) => (
              <EntryRow key={entry.key} entry={entry} wide when={entry.at ? formatManila(entry.at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : dayLabel(entry.day)} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">The next {DAYS_AHEAD} days</h2>
        {days.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title="Nothing scheduled"
            description="Hearings, guidance sessions, follow-ups and deadlines you can see will appear here."
          />
        ) : (
          <div className="space-y-5">
            {days.map(({ day, entries }) => (
              <div key={day}>
                <h3 className="mb-2 flex items-baseline gap-2 text-base font-semibold text-tup-maroon-700">
                  {dayLabel(day)}
                  {day === today && <ToneBadge label="Today" tone="info" />}
                  {day === tomorrow && <ToneBadge label="Tomorrow" tone="neutral" />}
                </h3>
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                  {entries.map((entry) => (
                    <EntryRow key={entry.key} entry={entry} when={entry.at ? formatManilaTime(entry.at) : "All day"} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** "Thursday, October 8" for a YYYY-MM-DD Manila date. */
function dayLabel(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return formatManila(manilaInstant(year, month - 1, date, 12 * 60), { weekday: "long", month: "long", day: "numeric" });
}

/** Case numbers (OSA-2026-0001) and student numbers stay on one line. */
const CODE = /\b[A-Z]{2,5}-\d{2,4}-\d{3,4}\b/g;

function Unbroken({ text }: { text: string }) {
  const parts = text.split(CODE);
  const codes = text.match(CODE) ?? [];
  return (
    <>
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {codes[index] && <span className="whitespace-nowrap">{codes[index]}</span>}
        </span>
      ))}
    </>
  );
}

/** One line of the agenda. `wide` leaves room for a date as well as a time. */
function EntryRow({ entry, when, wide = false }: { entry: AgendaEntry; when: string; wide?: boolean }) {
  return (
    <li>
      <Link
        href={entry.href}
        className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none sm:flex-nowrap"
      >
        <span className={`${wide ? "sm:w-36" : "sm:w-24"} shrink-0 pt-0.5 text-base font-semibold tabular-nums`}>{when}</span>
        <span className="min-w-0 flex-1 basis-60">
          <span className="block text-base font-medium">
            <Unbroken text={entry.title} />
          </span>
          <span className="block text-base text-muted-foreground">{entry.detail}</span>
        </span>
        {entry.badge && <ToneBadge label={entry.badge.label} tone={entry.badge.tone} />}
      </Link>
    </li>
  );
}
