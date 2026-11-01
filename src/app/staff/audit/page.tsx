import type { Metadata } from "next";
import Link from "next/link";
import { ScrollIcon as ScrollText } from "@phosphor-icons/react/ssr";

import { EmptyState } from "@/components/osa/empty-state";
import { RestrictedNotice } from "@/components/osa/restricted-notice";
import { PageHeader } from "@/components/shared/page-header";
import { getStaffContext } from "@/lib/osa/staff-context";
import { loose } from "@/lib/supabase/loose";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { formatManila } from "@/lib/utils/time";
import { STAFF_ROLE_LABELS, type StaffRole } from "@/types/osa";

export const metadata: Metadata = {
  title: "Activity history",
};

export const revalidate = 15;

interface AuditRow {
  id: string;
  user_id: string;
  action: string;
  resource: string;
  details: string | null;
  ip_address: string | null;
  created_at: string;
}

/** Quick filters for the actions people actually go looking for. */
const FILTERS = [
  { key: "all", label: "All" },
  { key: "access", label: "Campus access" },
  { key: "id_validation_reviewed", label: "ID validation" },
  { key: "clearance", label: "Clearance" },
  { key: "case", label: "Cases" },
  { key: "login", label: "Sign-ins" },
] as const;

/**
 * The audit trail.
 *
 * `audit_logs` has INSERT and SELECT policies and deliberately no UPDATE or
 * DELETE — append-only in the database, not merely by convention. That is
 * what makes it worth anything in a due-process dispute: nobody, including an
 * administrator through this app, can rewrite what happened.
 */
export default async function StaffAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const staff = await getStaffContext();
  if (!staff || (!staff.isAdmin && staff.role !== "osa_head")) {
    return (
      <RestrictedNotice
        title="Activity history"
        audience="The activity history is restricted to administrators and the OSA head."
      />
    );
  }

  const { filter } = await searchParams;
  const activeFilter = FILTERS.some((f) => f.key === filter) ? filter! : "all";

  const supabase = await createClient();
  const db = loose(supabase);

  let query = db
    .from("audit_logs")
    .select("id, user_id, action, resource, details, ip_address, created_at")
    .order("created_at", { ascending: false })
    .limit(150);

  if (activeFilter !== "all") {
    // `like` against the action prefix keeps the filter list short without a
    // separate category column.
    query = query.like("action", `${activeFilter}%`);
  }

  const { data: logRows } = await query;
  const logs = (logRows as AuditRow[] | null) ?? [];

  // Resolve actor names in two lookups rather than a join: audit_logs points
  // at auth.users, which application code can't select from directly.
  const userIds = [...new Set(logs.map((log) => log.user_id))];
  const [{ data: staffRows }, { data: studentRows }] = userIds.length
    ? await Promise.all([
        db.from("staff").select("user_id, full_name, role_type").in("user_id", userIds),
        db
          .from("students")
          .select("user_id, first_name, last_name, student_number")
          .in("user_id", userIds),
      ])
    : [{ data: [] }, { data: [] }];

  const actors = new Map<string, string>();
  for (const row of (staffRows as Array<{ user_id: string; full_name: string; role_type: string }> | null) ?? []) {
    actors.set(row.user_id, `${row.full_name} (${STAFF_ROLE_LABELS[row.role_type as StaffRole] ?? row.role_type})`);
  }
  for (const row of (studentRows as Array<{
    user_id: string;
    first_name: string;
    last_name: string;
    student_number: string;
  }> | null) ?? []) {
    if (!actors.has(row.user_id)) {
      actors.set(row.user_id, `${row.first_name} ${row.last_name} (${row.student_number})`);
    }
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Staff", href: "/staff/dashboard" }, { label: "Activity history" }]}
        title="Activity history"
        description="Who did what in STARS, when, and from where. Entries can be added, never changed or removed."
      />

      <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-border">
        {FILTERS.map((option) => (
          <Link
            key={option.key}
            href={`/staff/audit?filter=${option.key}`}
            className={cn(
              "-mb-px flex min-h-11 items-center border-b-2 px-3 text-base font-medium transition-colors",
              activeFilter === option.key
                ? "border-tup-maroon-600 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No entries"
          description="Nothing matching this filter has been recorded yet."
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {logs.map((log) => (
            <li key={log.id} className="flex flex-wrap gap-x-6 gap-y-1 px-5 py-3">
              <p className="w-full text-sm tabular-nums text-muted-foreground sm:w-44 sm:shrink-0 sm:text-base">
                {formatManila(log.created_at, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </p>
              <div className="min-w-0 flex-1 basis-72 space-y-0.5">
                <p className="text-base">
                  {/* The action in words; the stored code is kept for anyone checking. */}
                  <span className="font-semibold" title={log.action}>
                    {actionLabel(log.action)}
                  </span>
                  <span className="text-muted-foreground"> · {actionLabel(log.resource)}</span>
                </p>
                <p className="text-base">{actors.get(log.user_id) ?? "Unknown account"}</p>
                {log.details && (
                  <p className="line-clamp-2 break-words text-sm text-muted-foreground">{readableDetails(log.details)}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  From <span className="font-mono">{log.ip_address ?? "an address not recorded"}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 max-w-prose text-base leading-relaxed text-muted-foreground">
        Showing the 150 most recent entries. Audit records are retained for the life of the
        student record and may be disclosed to the National Privacy Commission on request.
      </p>
    </div>
  );
}

/** "case_updated" as "Case updated", "violation_cases" as "Violation cases". */
function actionLabel(code: string): string {
  const words = code.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Details are stored as JSON ({"student_number":"TUPM-99-1001"}); shown as
 * "Student number: TUPM-99-1001". Anything that is not a JSON object is
 * shown exactly as stored.
 */
function readableDetails(details: string): string {
  try {
    const parsed: unknown = JSON.parse(details);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return details;
    return Object.entries(parsed as Record<string, unknown>)
      .map(([key, value]) => {
        const shown = Array.isArray(value)
          ? value.join(", ")
          : value !== null && typeof value === "object"
            ? JSON.stringify(value)
            : String(value);
        return `${actionLabel(key)}: ${shown}`;
      })
      .join(" · ");
  } catch {
    return details;
  }
}
