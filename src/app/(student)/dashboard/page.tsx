import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRightIcon, CheckCircleIcon, ChatTextIcon as MessageSquare, FolderOpenIcon as FolderOpen, PlusIcon as Plus, MedalIcon as Award, IdentificationCardIcon as IdCard, ShieldWarningIcon as ShieldAlert, MegaphoneIcon as Megaphone, WarningIcon } from "@phosphor-icons/react/ssr";


import { studentTasks, type StudentCase, type StudentHearing } from "@/lib/students/student-today";
import { loose } from "@/lib/supabase/loose";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { formatManila, formatManilaLongDate, formatManilaMonthDay, manilaWallClock } from "@/lib/utils/time";
import { CASE_STATUS_META, ID_STATUS_META, type IdValidationStatus } from "@/types/osa";
import { PageHeader } from "@/components/shared/page-header";
import { ModuleCard } from "@/components/shared/module-card";
import { GlanceStrip } from "@/components/students/record-parts";
import { buttonVariants } from "@/components/ui/button";
import { getActiveTerm } from "@/lib/settings/active-term";

export const metadata: Metadata = {
  title: "Home",
};

export const revalidate = 30;

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  student_number: string;
  program: string;
  year_level: string;
  scholastic_status: string;
}

const SECONDARY_BUTTON = cn(
  buttonVariants({ variant: "outline" }),
  "border-tup-maroon-300 text-tup-maroon-700 hover:bg-tup-maroon-50 hover:text-tup-maroon-800",
);
const URGENT_BUTTON = cn(buttonVariants(), "bg-destructive text-white hover:bg-destructive/90");

function getGreeting(): string {
  // The Manila hour. The server's clock is UTC, which would greet a student
  // at 7 PM with "Good morning".
  const hour = Math.floor(manilaWallClock(new Date()).minutes / 60);
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: studentRaw } = await supabase
    .from("students")
    .select(
      "id, first_name, last_name, student_number, program, year_level, scholastic_status"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const student = studentRaw as StudentRow | null;
  if (!student) redirect("/profile");

  const db = loose(supabase);
  const term = await getActiveTerm();

  // Everything below reads the tables the rest of the portal uses. (Until
  // November 2026 this page read leftover tables from before migration 00006,
  // so a student with open cases was shown a clean record.)
  const [casesResult, hearingsResult, idResult, concernsResult, documentsResult] = await Promise.all([
    db
      .from("violation_cases")
      .select("case_number, status, apology_letters(review_status), case_settlements(student_signed_at), case_appeals(status, appeal_deadline)")
      .eq("student_id", student.id),
    db
      .from("case_hearings")
      .select("status, scheduled_start, violation_cases!inner(student_id)")
      .eq("violation_cases.student_id", student.id),
    db
      .from("id_validations")
      .select("status")
      .eq("student_id", student.id)
      .eq("school_year", term.schoolYear)
      .eq("semester", term.semester)
      .maybeSingle(),
    db
      .from("concerns")
      .select("id", { count: "exact", head: true })
      .eq("student_id", student.id)
      .in("status", ["pending", "in_review"]),
    db
      .from("academic_documents")
      .select("uploaded_at", { count: "exact" })
      .eq("student_id", student.id)
      .order("uploaded_at", { ascending: false })
      .limit(1),
  ]);

  const cases = (casesResult.data as StudentCase[] | null) ?? [];
  const hearings = (hearingsResult.data as StudentHearing[] | null) ?? [];
  const idStatus = ((idResult.data as { status: IdValidationStatus } | null)?.status ?? null) as IdValidationStatus | null;
  const openCases = cases.filter((c) => !CASE_STATUS_META[c.status]?.isTerminal).length;
  const openConcerns = concernsResult.count ?? 0;
  const documentsCount = documentsResult.count ?? 0;
  const lastUpload = (documentsResult.data as Array<{ uploaded_at: string }> | null)?.[0]?.uploaded_at;

  const tasks = studentTasks({
    cases,
    hearings,
    idStatus,
    now: new Date(),
    formatWhen: (iso) => formatManila(iso, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }),
    formatDay: (iso) => formatManilaLongDate(iso),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title={`${getGreeting()}, ${student.first_name}`}
        description={`${term.schoolYearLabel}, ${term.semester}. Here is what needs your attention, and where to find everything else.`}
      >
        <Link
          href="/concerns/new"
          className={cn(buttonVariants(), "gap-1.5 bg-tup-maroon-600 text-white hover:bg-tup-maroon-700")}
        >
          <Plus className="h-4 w-4" />
          Submit a concern
        </Link>
      </PageHeader>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <h2 className="border-b border-border px-6 py-4 font-display text-lg font-semibold tracking-tight">
          Needs your attention
        </h2>
        {tasks.length === 0 ? (
          <div className="flex items-center gap-4 px-6 py-8">
            <CheckCircleIcon className="h-8 w-8 shrink-0 text-green-700" />
            <div>
              <p className="text-lg font-medium">Nothing needs your attention right now.</p>
              <p className="text-base text-muted-foreground">
                Meetings, letters the OSA asks for and other deadlines will appear here.
              </p>
            </div>
          </div>
        ) : (
          <ul>
            {tasks.map((task) => (
              <li
                key={task.key}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border px-6 py-4 last:border-0",
                  task.urgent && "bg-red-50/60",
                )}
              >
                <p className="flex min-w-0 items-center gap-3 text-lg">
                  {task.urgent ? (
                    <WarningIcon className="h-6 w-6 shrink-0 text-destructive" aria-label="Urgent" />
                  ) : (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden="true">
                      <span className="h-2.5 w-2.5 rounded-full bg-tup-maroon-600" />
                    </span>
                  )}
                  <span className={cn(task.urgent && "font-semibold")}>{task.text}</span>
                </p>
                <Link href={task.href} className={task.urgent ? URGENT_BUTTON : SECONDARY_BUTTON}>
                  {task.action}
                  <ArrowRightIcon className="h-5 w-5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* The figures, in one strip. */}
      <GlanceStrip
        items={[
          {
            key: "cases",
            label: "Open cases",
            value: openCases === 0 ? "None" : String(openCases),
            tone: openCases > 0 ? "warning" : "success",
          },
          { key: "concerns", label: "Open concerns", value: openConcerns === 0 ? "None" : String(openConcerns), tone: "neutral" },
          {
            key: "id",
            label: "ID this term",
            value: idStatus ? ID_STATUS_META[idStatus].label : "Not validated",
            tone: idStatus === "validated" ? "success" : "warning",
          },
          {
            key: "documents",
            label: "Documents uploaded",
            value: documentsCount === 0 ? "None yet" : `${documentsCount}, last on ${formatManilaMonthDay(lastUpload)}`,
            tone: "neutral",
          },
        ]}
      />

      <section>
        <h2 className="mb-3.5 font-display text-lg font-semibold tracking-tight">Everything else</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ModuleCard
            title="Scholarships"
            description="See which scholarships you qualify for and the documents each one needs."
            icon={Award}
            href="/scholarships"
            linkLabel="Check eligibility"
          />
          <ModuleCard
            title="Submit a concern"
            description="Ask the OSA for help, or file a complaint. An AI summary helps staff read it sooner."
            icon={MessageSquare}
            href="/concerns"
            linkLabel="New concern"
            variant="ai"
          />
          <ModuleCard
            title="My violations"
            description="Your disciplinary record, what each case needs from you, and how it ended."
            icon={ShieldAlert}
            href="/violations"
            linkLabel="Open my violations"
          />
          <ModuleCard
            title="Digital ID"
            description="Your QR code for the campus gates, and this term's validation."
            icon={IdCard}
            href="/id"
            linkLabel="Show my ID"
          />
          <ModuleCard
            title="Academic records"
            description="Upload your Certificate of Registration and rating slips for the OSA to verify."
            icon={FolderOpen}
            href="/records"
            linkLabel="Open records"
          />
          <ModuleCard
            title="Notifications"
            description="Summons, schedules, clearance updates and other notices from the OSA."
            icon={Megaphone}
            href="/notifications"
            linkLabel="Read all"
          />
        </div>
      </section>
    </div>
  );
}
