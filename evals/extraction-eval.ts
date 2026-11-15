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
 * Writes evals/output/extraction-report.md with totals only (no names or
 * numbers from the documents), and the per-document detail to
 * evals/documents/private/extraction-detail.json.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*(GROQ_[A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
  if (match) process.env[match[1]] = match[2].trim();
}
const { extractAcademicDocument } = await import("@/lib/ai/extract-academic");

type DocType = "certificate_of_registration" | "rating_slip";
interface Subject {
  subject_code: string;
  units?: number;
  grade?: number | string;
}
interface Label {
  file: string;
  documentType: DocType;
  expected: {
    student_number?: string;
    student_name?: string;
    school_year?: string;
    semester?: string;
    program?: string;
    gwa?: number;
    units_enrolled?: number;
    subjects?: Subject[];
  };
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
const sameNumber = (a: unknown, b: unknown) => a != null && b != null && Math.abs(Number(a) - Number(b)) < 0.005;
const sameGrade = (a: unknown, b: unknown) => (isFinite(Number(a)) && isFinite(Number(b)) ? sameNumber(a, b) : norm(a) === norm(b));

const FIELDS = ["student_number", "student_name", "school_year", "semester", "program", "gwa", "units_enrolled"] as const;
const tally: Record<string, { right: number; total: number }> = {};
const count = (field: string, right: boolean) => {
  tally[field] ??= { right: 0, total: 0 };
  tally[field].total += 1;
  if (right) tally[field].right += 1;
};
const detail: unknown[] = [];
const confidences: Array<{ confidence: number; allRight: boolean }> = [];
let failed = 0;

for (const label of labels) {
  const file = path.join(PRIVATE, label.file);
  const mediaType = MEDIA[path.extname(file).toLowerCase()];
  if (!fs.existsSync(file) || !mediaType) {
    console.log(`${label.file}: missing or not a PDF, JPG or PNG; skipped`);
    continue;
  }
  const outcome = await extractAcademicDocument({ bytes: new Uint8Array(fs.readFileSync(file)), mediaType, documentType: label.documentType });
  if (!outcome.ok) {
    failed += 1;
    detail.push({ file: label.file, error: outcome.error });
    console.log(`${label.file}: could not be read (${outcome.error})`);
    await new Promise((resolve) => setTimeout(resolve, 15000));
    continue;
  }
  const got = outcome.data as Record<string, unknown> & { subjects?: Subject[] };
  const fieldResults: Record<string, boolean> = {};
  for (const field of FIELDS) {
    const want = label.expected[field];
    if (want == null) continue;
    const right = field === "gwa" || field === "units_enrolled" ? sameNumber(got[field], want) : norm(got[field]) === norm(want);
    fieldResults[field] = right;
    count(field, right);
  }
  const rows = (label.expected.subjects ?? []).map((want) => {
    const match = (got.subjects ?? []).find((s) => norm(s.subject_code) === norm(want.subject_code));
    const found = Boolean(match);
    const units = want.units == null ? null : found && sameNumber(match!.units, want.units);
    const grade = want.grade == null ? null : found && sameGrade(match!.grade, want.grade);
    count("subject row found", found);
    if (units !== null) count("subject units", units);
    if (grade !== null) count("subject grade", grade);
    return { code: want.subject_code, found, units, grade };
  });
  const extraRows = (got.subjects ?? []).filter((s) => !(label.expected.subjects ?? []).some((w) => norm(w.subject_code) === norm(s.subject_code))).length;
  const allRight = Object.values(fieldResults).every(Boolean) && rows.every((r) => r.found && r.units !== false && r.grade !== false) && extraRows === 0;
  count("document entirely right", allRight);
  confidences.push({ confidence: outcome.confidence, allRight });
  detail.push({ file: label.file, model: outcome.model, confidence: outcome.confidence, fields: fieldResults, rows, extraRows, got });
  console.log(`${label.file}: ${allRight ? "all right" : "some differences"} (confidence ${outcome.confidence})`);
  await new Promise((resolve) => setTimeout(resolve, 15000)); // free plan token budget
}

fs.writeFileSync(path.join(PRIVATE, "extraction-detail.json"), JSON.stringify(detail, null, 2));
const pct = (r: number, t: number) => (t ? `${((100 * r) / t).toFixed(1)}%` : "n/a");
const mean = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : "n/a");
const scored = confidences.length;
const report = `# AI document reading: evaluation

Run ${new Date().toISOString().slice(0, 10)} on ${labels.length} labelled documents (${labels.filter((l) => l.documentType === "certificate_of_registration").length} CORs, ${labels.filter((l) => l.documentType === "rating_slip").length} rating slips); ${scored} were read${failed ? `, ${failed} could not be` : ""}. Each was read with STARS's own extraction (Groq; photos with the vision model, PDFs from their text layer) and compared field by field with what a person read off the paper.

| Field | Correct |
|---|---|
${Object.entries(tally).map(([field, t]) => `| ${field} | ${t.right}/${t.total} (${pct(t.right, t.total)}) |`).join("\n")}

Mean confidence the AI reported: ${mean(confidences.filter((c) => c.allRight).map((c) => c.confidence))} on documents it read entirely right, ${mean(confidences.filter((c) => !c.allRight).map((c) => c.confidence))} on the rest.

STARS never uses these figures unchecked: every document is verified by an OSA officer on screen or against the Registrar-stamped copy before it counts (W7). This measures how much correcting the officer has to do.
`;
fs.mkdirSync(path.join(ROOT, "evals/output"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "evals/output/extraction-report.md"), report);
console.log("\nReport: evals/output/extraction-report.md");
