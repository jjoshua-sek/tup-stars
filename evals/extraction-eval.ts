/**
 * Measures how accurately STARS's AI reads CORs and rating slips.
 *
 *   npx vite-node --config evals/vite.config.mjs evals/extraction-eval.ts
 *
 * Put the documents in evals/documents/private/ (git ignores that folder:
 * these are real students' records) with a labels.json beside them, copied
 * from evals/documents/labels.example.json and filled in by hand from the
 * paper: what a careful person reads off each document. Each document is
 * read with extractAcademicDocument, the function the app uses, and every
 * field is compared with the label.
 *
 * Scoring reads, not formatting:
 *   - a label may list several acceptable values (["BSIT", "Bachelor of
 *     Science in Information Technology"]); the prompt leaves such fields
 *     free-form;
 *   - a name matches when it has the same words in any order
 *     ("PAUSAL, JOHN EMANUEL" = "John Emanuel Pausal");
 *   - subject rows are paired by code ignoring dashes and underscores
 *     ("IT303--M" = "IT303-M"), and the exact code is scored on its own;
 *   - on a COR, each labelled class meeting (day, start, end) must appear.
 *
 * Writes evals/output/extraction-report.md with totals only (no names or
 * numbers from the documents), and the per-document detail to
 * evals/documents/private/extraction-detail.json. Re-runs skip documents
 * already read (delete that file to start over).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*(GROQ_[A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
  if (match) process.env[match[1]] = match[2].trim();
}
const { extractAcademicDocument } = await import("@/lib/ai/extract-academic");
// STARS files a document under printedTerm(), which reads "Second" as "2nd Semester", so the semester is scored the same way.
const { printedTerm } = await import("@/lib/documents/integrity");
const asSemester = (v: unknown) => printedTerm("2000-2001", String(v ?? ""))?.semester ?? norm(v);

type DocType = "certificate_of_registration" | "rating_slip";
type OneOrMany = string | string[];
interface Meeting {
  day: string;
  start: string;
  end: string;
}
interface Subject {
  subject_code: string;
  units?: number;
  grade?: number | string;
  schedule?: Meeting[];
}
interface Label {
  file: string;
  documentType: DocType;
  expected: {
    student_number?: OneOrMany;
    student_name?: OneOrMany;
    school_year?: OneOrMany;
    semester?: OneOrMany;
    program?: OneOrMany;
    college?: OneOrMany;
    gwa?: number;
    units_enrolled?: number;
    subjects?: Subject[];
  };
}
interface GotSubject {
  subject_code?: string;
  units?: number;
  grade?: number | string;
  schedule?: Array<{ day_of_week?: string; start_time?: string; end_time?: string }>;
}

const PRIVATE = path.join(ROOT, "evals/documents/private");
const labelsFile = path.join(PRIVATE, "labels.json");
if (!fs.existsSync(labelsFile)) {
  console.log("No evals/documents/private/labels.json yet. Copy evals/documents/labels.example.json there, add the files, and fill it in.");
  process.exit(0);
}
const labels = JSON.parse(fs.readFileSync(labelsFile, "utf8")) as Label[];

const MEDIA: Record<string, string> = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".php": "application/pdf" };
const norm = (v: unknown) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, " ").replace(/[–—]/g, "-");
const codeKey = (v: unknown) => norm(v).replace(/[-_\s]/g, "");
const words = (v: unknown) => norm(v).replace(/[.,]/g, " ").split(" ").filter(Boolean).sort().join(" ");
const anyOf = (want: OneOrMany) => (Array.isArray(want) ? want : [want]);
const sameNumber = (a: unknown, b: unknown) => a != null && b != null && Math.abs(Number(a) - Number(b)) < 0.005;
const sameGrade = (a: unknown, b: unknown) => (isFinite(Number(a)) && isFinite(Number(b)) ? sameNumber(a, b) : norm(a) === norm(b));
/** "4:00" / "04:00" / "16:00" all compare as minutes past midnight. */
const minutes = (t: unknown) => {
  const m = String(t ?? "").match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
};

const TEXT_FIELDS = ["student_number", "student_name", "school_year", "semester", "program", "college"] as const;
const tally: Record<string, { right: number; total: number }> = {};
const count = (field: string, right: boolean) => {
  tally[field] ??= { right: 0, total: 0 };
  tally[field].total += 1;
  if (right) tally[field].right += 1;
};

const detailFile = path.join(PRIVATE, "extraction-detail.json");
const detail: Record<string, { error?: string; model?: string; confidence?: number; got?: Record<string, unknown> }> =
  fs.existsSync(detailFile) ? JSON.parse(fs.readFileSync(detailFile, "utf8")) : {};

// Read every document not read yet.
for (const label of labels) {
  if (detail[label.file]?.got) continue;
  const file = path.join(PRIVATE, label.file);
  const mediaType = MEDIA[path.extname(file).toLowerCase()];
  if (!fs.existsSync(file) || !mediaType) {
    console.log(`${label.file}: missing or not a PDF, JPG or PNG; skipped`);
    continue;
  }
  const outcome = await extractAcademicDocument({ bytes: new Uint8Array(fs.readFileSync(file)), mediaType, documentType: label.documentType });
  detail[label.file] = outcome.ok
    ? { model: outcome.model, confidence: outcome.confidence, got: outcome.data as Record<string, unknown> }
    : { error: outcome.error };
  console.log(`${label.file}: ${outcome.ok ? `read (confidence ${outcome.confidence})` : `could not be read: ${outcome.error}`}`);
  fs.writeFileSync(detailFile, JSON.stringify(detail, null, 2));
  await new Promise((resolve) => setTimeout(resolve, 75000)); // free plan token budget (the vision model's per-minute limit is tight)
}

// Score.
const perDoc: Array<{ file: string; type: DocType; via: string; allRight: boolean; misses: string[]; confidence: number }> = [];
let failed = 0;
for (const label of labels) {
  const read = detail[label.file];
  if (!read?.got) {
    if (read?.error) failed += 1;
    continue;
  }
  const got = read.got as Record<string, unknown> & { subjects?: GotSubject[] };
  const misses: string[] = [];
  const check = (field: string, right: boolean, note: string) => {
    count(field, right);
    if (!right) misses.push(note);
  };
  for (const field of TEXT_FIELDS) {
    const want = label.expected[field];
    if (want == null) continue;
    const right = anyOf(want).some((w) =>
      field === "student_name" ? words(got[field]) === words(w) : field === "semester" ? asSemester(got[field]) === asSemester(w) : norm(got[field]) === norm(w),
    );
    // Names and student numbers stay out of the report, which is committed.
    const personal = field === "student_name" || field === "student_number";
    check(field, right, personal ? `${field} read differently` : `${field}: read "${got[field] ?? ""}"`);
  }
  for (const field of ["gwa", "units_enrolled"] as const) {
    const want = label.expected[field];
    if (want == null) continue;
    check(field, sameNumber(got[field], want), `${field}: read ${got[field] ?? "nothing"}`);
  }
  const gotSubjects = got.subjects ?? [];
  for (const want of label.expected.subjects ?? []) {
    const match = gotSubjects.find((s) => codeKey(s.subject_code) === codeKey(want.subject_code));
    check("subject row found", Boolean(match), `${want.subject_code}: row missing`);
    if (!match) continue;
    check("subject code exact", norm(match.subject_code) === norm(want.subject_code), `${want.subject_code}: code read as "${match.subject_code}"`);
    if (want.units != null) check("subject units", sameNumber(match.units, want.units), `${want.subject_code}: units ${match.units}`);
    if (want.grade != null) check("subject grade", sameGrade(match.grade, want.grade), `${want.subject_code}: grade ${match.grade}`);
    for (const meeting of want.schedule ?? []) {
      const hit = (match.schedule ?? []).some(
        (m) => norm(m.day_of_week) === norm(meeting.day) && minutes(m.start_time) === minutes(meeting.start) && minutes(m.end_time) === minutes(meeting.end),
      );
      check("class meeting (day and times)", hit, `${want.subject_code}: ${meeting.day} ${meeting.start}-${meeting.end} not read`);
    }
  }
  const extra = gotSubjects.filter((s) => !(label.expected.subjects ?? []).some((w) => codeKey(w.subject_code) === codeKey(s.subject_code)));
  for (const s of extra) misses.push(`extra row "${s.subject_code}"`);
  const allRight = misses.length === 0;
  count(`${label.documentType === "rating_slip" ? "rating slip" : "COR"} entirely right`, allRight);
  const via = path.extname(label.file).toLowerCase() === ".pdf" ? "PDF text" : "photo";
  perDoc.push({ file: label.file, type: label.documentType, via, allRight, misses, confidence: read.confidence ?? 0 });
}

const pct = (r: number, t: number) => (t ? `${((100 * r) / t).toFixed(1)}%` : "n/a");
const mean = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : "n/a");
const ofType = (t: DocType) => labels.filter((l) => l.documentType === t).length;
const byPath = (via: string) => perDoc.filter((d) => d.via === via);
const report = `# AI document reading: evaluation

Run ${new Date().toISOString().slice(0, 10)} on ${labels.length} labelled documents (${ofType("rating_slip")} rating slips, ${ofType("certificate_of_registration")} CORs); ${perDoc.length} were read${failed ? `, ${failed} could not be` : ""}. Each was read with STARS's own extraction (Groq: a photo with the vision model, a PDF from its text layer) and compared field by field with what a person read off the paper. Names match in any word order; subject rows are paired ignoring dashes and underscores in the code, and the exact code is scored separately.

| Field | Correct |
|---|---|
${Object.entries(tally).map(([field, t]) => `| ${field} | ${t.right}/${t.total} (${pct(t.right, t.total)}) |`).join("\n")}

By way of reading: PDF text ${byPath("PDF text").filter((d) => d.allRight).length}/${byPath("PDF text").length} documents entirely right, photos ${byPath("photo").filter((d) => d.allRight).length}/${byPath("photo").length}.

Mean confidence the AI reported: ${mean(perDoc.filter((d) => d.allRight).map((d) => d.confidence))} on documents it read entirely right, ${mean(perDoc.filter((d) => !d.allRight).map((d) => d.confidence))} on the rest.

## What it got wrong

${perDoc.filter((d) => !d.allRight).map((d) => `- A ${d.type === "rating_slip" ? "rating slip" : "COR"} read as ${d.via === "photo" ? "a photo" : "PDF text"}: ${d.misses.join("; ")}.`).join("\n") || "- Nothing."}

STARS never uses these figures unchecked: every document is verified by an OSA officer on screen or against the Registrar-stamped copy before it counts (W7). This measures how much correcting the officer has to do.
`;
fs.mkdirSync(path.join(ROOT, "evals/output"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "evals/output/extraction-report.md"), report);
console.log(`\nScored ${perDoc.length}/${labels.length}. Report: evals/output/extraction-report.md`);
