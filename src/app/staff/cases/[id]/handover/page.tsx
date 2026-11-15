import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon as ArrowLeft, LockIcon as Lock } from "@phosphor-icons/react/ssr";

import { CodiHandoverForm, PrintButton } from "@/components/cases/codi-handover-form";
import { COMPLAINANT_LABELS, handoverFromTimeline, manilaInputValue } from "@/lib/osa/codi-handover";
import { codiHandoverAccess } from "@/lib/osa/codi-handover-access";
import { getStaffContext } from "@/lib/osa/staff-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { loose } from "@/lib/supabase/loose";
import { logAuditEvent } from "@/lib/utils/audit";
import { formatIncidentWhen, formatManilaDateTime } from "@/lib/utils/time";

export const metadata: Metadata = {
  title: "CODI handover sheet",
};

export const dynamic = "force-dynamic";

const DOCUMENT_LABELS: Record<string, string> = {
  complaint_letter: "Complaint letter",
  evidence: "Evidence",
  apology_letter: "Apology letter",
  settlement_agreement: "Settlement agreement",
  sanction_notice: "Sanction notice",
  summons_copy: "Summons",
  other: "Other",
};

interface CaseRow {
  id: string;
  case_number: string;
  created_at: string;
  incident_date: string;
  incident_time: string | null;
  incident_location: string | null;
  description: string;
  complainant_type: string;
  complainant_name: string | null;
  students: { first_name: string; last_name: string; student_number: string; program: string | null; year_level: string | null } | null;
  violation_types: { code: string; name: string; handbook_reference: string | null } | null;
}

/**
 * The sheet the OSA hands CODI with a confidential case (adviser item 2): the
 * case, the parties, the files, the case's history with dates and times, and
 * signature blocks for turning it over and receiving it. Printed from the
 * browser; the handover itself is then recorded below the sheet, so the case
 * stays logged in STARS while CODI runs its own proceedings.
 */
export default async function CodiHandoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await getStaffContext();
  if (!staff) notFound();
  const access = await codiHandoverAccess(staff, id);
  // A case this person may not open looks exactly like one that does not exist.
  if (!access) notFound();

  const db = loose(createAdminClient());
  const [{ data: caseRow }, { data: escalationRows }, { data: timelineRows }, { data: documentRows }] = await Promise.all([
    db
      .from("violation_cases")
      .select(
        "id, case_number, created_at, incident_date, incident_time, incident_location, description, complainant_type, complainant_name, students(first_name, last_name, student_number, program, year_level), violation_types(code, name, handbook_reference)",
      )
      .eq("id", id)
      .maybeSingle(),
    db
      .from("case_escalations")
      .select("escalated_at, reason, staff:escalated_by(full_name)")
      .eq("case_id", id)
      .eq("escalated_to", "CODI")
      .order("escalated_at", { ascending: false })
      .limit(1),
    db
      .from("case_timeline")
      .select("event_type, summary, details, actor_label, occurred_at")
      .eq("case_id", id)
      .order("occurred_at", { ascending: true }),
    db
      .from("case_documents")
      .select("document_type, file_name, uploaded_at")
      .eq("case_id", id)
      .order("uploaded_at", { ascending: true }),
  ]);

  const violationCase = caseRow as CaseRow | null;
  if (!violationCase) notFound();

  const escalation = ((escalationRows as Array<{ escalated_at: string; reason: string; staff: { full_name: string } | null }> | null) ?? [])[0] ?? null;
  const allEntries = (timelineRows as Array<{ event_type: string; summary: string; details: unknown; actor_label: string | null; occurred_at: string }> | null) ?? [];
  const handover = handoverFromTimeline(allEntries);
  // The referring officer sees the history up to the handover; what CODI
  // does after it is for cleared staff only.
  const entries = access.cleared || !handover ? allEntries : allEntries.filter((entry) => entry.occurred_at <= handover.recordedAt);
  const documents = (documentRows as Array<{ document_type: string; file_name: string; uploaded_at: string }> | null) ?? [];

  const filing = allEntries.find((entry) => entry.event_type === "case_filed");
  const referredAt = escalation?.escalated_at ?? violationCase.created_at;
  const referredBy = escalation?.staff?.full_name ?? filing?.actor_label ?? "The OSA";
  const now = new Date();

  await logAuditEvent(staff.userId, "codi_handover_viewed", "violation_cases", {
    case_id: violationCase.id,
    case_number: violationCase.case_number,
    as: access.cleared ? "cleared" : "referring_officer",
  });

  const student = violationCase.students;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={access.cleared ? `/staff/cases/${violationCase.id}` : "/staff/cases"}
          className="inline-flex min-h-11 items-center gap-1.5 text-base font-medium text-tup-maroon-700 underline-offset-2 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {access.cleared ? "Back to the case" : "Back to cases"}
        </Link>
        <PrintButton />
      </div>

      {/* The sheet */}
      <article className="rounded-xl border border-border bg-card p-6 text-base leading-relaxed sm:p-8 print:rounded-none print:border-0 print:p-0">
        <header className="flex items-start gap-4 border-b border-border pb-4">
          <Image src="/tup-seal.png" alt="TUP seal" width={64} height={64} className="h-16 w-16 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Technological University of the Philippines · Manila
            </p>
            <p className="text-sm text-muted-foreground">Office of Student Affairs</p>
            <h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-balance">
              Case handover to the Committee on Decorum and Investigation (CODI)
            </h1>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-sm font-semibold uppercase tracking-wide text-red-700">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Confidential
          </span>
        </header>

        <Block title="Case">
          <Field label="Case number">
            <span className="font-mono">{violationCase.case_number}</span>
          </Field>
          <Field label="Offense">
            {violationCase.violation_types
              ? `${violationCase.violation_types.name} (${violationCase.violation_types.code})${violationCase.violation_types.handbook_reference ? `, ${violationCase.violation_types.handbook_reference}` : ""}`
              : "Not recorded"}
          </Field>
          <Field label="Filed in STARS">{formatManilaDateTime(violationCase.created_at)}</Field>
          <Field label="Sent to CODI">
            {formatManilaDateTime(referredAt)}, by {referredBy}
            {escalation ? "" : " (the offense goes to CODI when it is filed)"}
          </Field>
          {escalation?.reason && <Field label="Reason for referral">{escalation.reason}</Field>}
        </Block>

        <Block title="Incident">
          <Field label="Date and time">{formatIncidentWhen(violationCase.incident_date, violationCase.incident_time, true)}</Field>
          <Field label="Place">{violationCase.incident_location ?? "Not recorded"}</Field>
          <Field label="What happened">
            <span className="whitespace-pre-line">{violationCase.description}</span>
          </Field>
        </Block>

        <Block title="Persons involved">
          <Field label="Respondent">
            {student
              ? `${student.first_name} ${student.last_name}, ${student.student_number}${student.program ? `, ${student.program}` : ""}${student.year_level ? `, ${student.year_level}` : ""}`
              : "Not recorded"}
          </Field>
          <Field label="Complainant">
            {COMPLAINANT_LABELS[violationCase.complainant_type] ?? violationCase.complainant_type}
            {violationCase.complainant_name ? `: ${violationCase.complainant_name}` : ""}
          </Field>
        </Block>

        <Block title="Files on record in STARS">
          {documents.length === 0 ? (
            <p className="text-muted-foreground">None uploaded. Hand over any paper evidence with this sheet.</p>
          ) : (
            <ul className="list-disc space-y-0.5 pl-5">
              {documents.map((document) => (
                <li key={`${document.file_name}-${document.uploaded_at}`}>
                  {DOCUMENT_LABELS[document.document_type] ?? document.document_type}: {document.file_name}{" "}
                  <span className="text-muted-foreground">(uploaded {formatManilaDateTime(document.uploaded_at)})</span>
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block title="Case history in STARS">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="w-44 py-1 pr-3 font-medium">Date and time</th>
                  <th className="py-1 pr-3 font-medium">What happened</th>
                  <th className="w-36 py-1 font-medium">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border align-top">
                {entries.map((entry) => (
                  <tr key={`${entry.occurred_at}-${entry.summary}`}>
                    <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums">{formatManilaDateTime(entry.occurred_at)}</td>
                    <td className="py-1.5 pr-3">{entry.summary}</td>
                    <td className="py-1.5">{entry.actor_label ?? "STARS"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>

        <Block title="Turnover">
          {handover && (
            <p className="mb-3">
              Recorded in STARS: received by <strong>{handover.receivedBy}</strong> on{" "}
              <strong>{formatManilaDateTime(handover.receivedAt)}</strong>
              {handover.codiReference ? `, CODI reference ${handover.codiReference}` : ""}.
            </p>
          )}
          <div className="grid gap-6 sm:grid-cols-2 print:grid-cols-2">
            <Signature role="Turned over by (OSA)" name={referredBy} />
            <Signature
              role="Received by (CODI)"
              name={handover?.receivedBy}
              at={handover ? formatManilaDateTime(handover.receivedAt) : undefined}
            />
          </div>
        </Block>

        <footer className="mt-6 border-t border-border pt-3 text-sm text-muted-foreground">
          Printed from STARS on {formatManilaDateTime(now)} by {staff.fullName}. CODI conducts its own proceedings; the
          case stays logged in STARS, where only staff cleared for confidential matters can open it (RA 7877, RA 11313,
          RA 10173).
        </footer>
      </article>

      {/* Recording the handover: on screen only */}
      <section className="rounded-xl border border-border bg-card p-5 print:hidden">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {handover ? "Handover recorded" : "Record the handover"}
        </h2>
        <p className="mb-4 mt-0.5 text-base text-muted-foreground">
          {handover
            ? `Received by ${handover.receivedBy} on ${formatManilaDateTime(handover.receivedAt)}, recorded by ${handover.recordedBy} on ${formatManilaDateTime(handover.recordedAt)}. If a detail is wrong, record a correction; the first entry stays in the history.`
            : "Once CODI has signed for the case, write down who received it and when. It goes into the case's history, which cannot be edited."}
        </p>
        <CodiHandoverForm caseId={violationCase.id} defaultReceivedAt={manilaInputValue(now)} correcting={Boolean(handover)} />
      </section>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 break-inside-avoid">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-tup-maroon-700">{title}</h2>
      <dl className="space-y-1.5">{children}</dl>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-4 sm:grid-cols-[11rem_1fr] print:grid-cols-[11rem_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Signature({ role, name, at }: { role: string; name?: string; at?: string }) {
  return (
    <div className="space-y-3">
      <p className="font-medium">{role}</p>
      <div>
        <div className="h-8 border-b border-foreground/60" />
        <p className="text-sm text-muted-foreground">Signature over printed name{name ? `: ${name}` : ""}</p>
      </div>
      <div>
        <div className="flex h-8 items-end border-b border-foreground/60 pb-0.5 text-sm">{at ?? ""}</div>
        <p className="text-sm text-muted-foreground">Date and time</p>
      </div>
    </div>
  );
}
