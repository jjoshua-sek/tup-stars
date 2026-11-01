import type { Metadata } from "next";
import { CaretDownIcon as ChevronDown, LockIcon as Lock } from "@phosphor-icons/react/ssr";

import { AccessFeed, type AccessEventRow } from "@/components/access/access-feed";
import { AnomalyList, type AnomalyRow } from "@/components/access/anomaly-list";
import { GateConsole, type GateRow } from "@/components/access/gate-console";
import { PageHeader } from "@/components/shared/page-header";
import { GlanceStrip } from "@/components/students/record-parts";
import { GATE_CONSOLE_COLUMNS, isGateOnline } from "@/lib/access/gate-status";
import { getAccessStaff } from "@/lib/access/guards";
import { loose } from "@/lib/supabase/loose";
import { createClient } from "@/lib/supabase/server";
import { startOfManilaDay } from "@/lib/utils/time";

export const metadata: Metadata = {
  title: "Campus gates",
};

// The live feed keeps itself current over Realtime; this only governs the
// first paint after a navigation.
export const revalidate = 30;

export default async function StaffGatesPage() {
  const staff = await getAccessStaff();

  if (!staff?.canView) {
    return (
      <div>
        <PageHeader
          breadcrumbs={[{ label: "Staff", href: "/staff/dashboard" }, { label: "Campus gates" }]}
          title="Campus gates"
        />
        <div className="grid place-items-center gap-3 rounded-xl border border-dashed border-border p-12 text-center">
          <Lock className="h-7 w-7 text-muted-foreground/50" />
          <p className="max-w-sm text-base text-muted-foreground">
            Campus access is limited to OSA officers, the OSA head and security personnel.
            Ask an administrator if you need this view.
          </p>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const db = loose(supabase);

  // Today's entries and denials count from Manila midnight. The server's own
  // midnight is UTC's, which falls at 8 AM here.
  const dayStartIso = startOfManilaDay().toISOString();

  const [
    { data: gatesRaw },
    { data: eventsRaw },
    { data: anomaliesRaw },
    { count: allowedToday },
    { count: deniedToday },
  ] = await Promise.all([
    db.from("access_gates").select(GATE_CONSOLE_COLUMNS).order("name", { ascending: true }),
    db
      .from("access_events")
      .select(
        "id, gate_label, direction, decision, enforced, reason, normalized_student_number, occurred_at",
      )
      .order("occurred_at", { ascending: false })
      .limit(40),
    db
      .from("access_anomalies")
      .select(
        "id, anomaly_type, severity, normalized_student_number, occurrence_count, details, last_detected_at, students(first_name, last_name, student_number)",
      )
      .eq("status", "open")
      .order("last_detected_at", { ascending: false })
      .limit(20),
    db
      .from("access_events")
      .select("id", { count: "exact", head: true })
      .eq("decision", "allow")
      .gte("occurred_at", dayStartIso),
    db
      .from("access_events")
      .select("id", { count: "exact", head: true })
      .eq("decision", "deny")
      .gte("occurred_at", dayStartIso),
  ]);

  const gates = (gatesRaw as GateRow[] | null) ?? [];
  const events = (eventsRaw as AccessEventRow[] | null) ?? [];
  const anomalies = (anomaliesRaw as AnomalyRow[] | null) ?? [];

  const onlineGates = gates.filter((gate) => isGateOnline(gate.last_seen_at)).length;
  const enforcingGates = gates.filter(
    (gate) => gate.enforcement_mode === "enforce" && gate.is_active,
  ).length;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Staff", href: "/staff/dashboard" }, { label: "Campus gates" }]}
        title="Campus gates"
        description="The ID turnstiles at each gate, what they let through today, and alerts to review."
      />

      {/* Today at a glance, in one strip rather than four tiles. */}
      <GlanceStrip
        items={[
          {
            key: "online",
            label: "Gates online",
            value: `${onlineGates} of ${gates.length}, ${enforcingGates} checking IDs`,
            tone: onlineGates < gates.length ? "warning" : "success",
          },
          { key: "allowed", label: "Entries today", value: String(allowedToday ?? 0), tone: "neutral" },
          {
            key: "denied",
            label: "Refused today",
            value: String(deniedToday ?? 0),
            tone: (deniedToday ?? 0) > 0 ? "warning" : "neutral",
          },
          {
            key: "alerts",
            label: "Alerts to review",
            value: String(anomalies.length),
            tone: anomalies.length > 0 ? "danger" : "neutral",
          },
        ]}
      />

      {/* Two columns only on very wide screens. */}
      <div className="mt-6 grid gap-6 2xl:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">
              Alerts to review
            </h2>
            <AnomalyList anomalies={anomalies} canManage={staff.canManage} />
          </section>

          <section>
            <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">Gates</h2>
            <GateConsole gates={gates} canManage={staff.canManage} />
            <details className="group mt-3 rounded-lg border border-border bg-card">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-base font-medium [&::-webkit-details-marker]:hidden">
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                Setting up a new gate lane
              </summary>
              <p className="max-w-prose border-t border-border px-4 py-3 text-base leading-relaxed text-muted-foreground">
                Each lane runs <span className="font-mono">/kiosk</span> in a browser and pairs once with its device
                key. Start a new lane in <strong>monitor</strong> mode: it records every scan and opens for everyone,
                so a week of real traffic surfaces the unvalidated IDs before anyone is held at the arm.
              </p>
            </details>
          </section>
        </div>

        <AccessFeed initialEvents={events} />
      </div>
    </div>
  );
}
