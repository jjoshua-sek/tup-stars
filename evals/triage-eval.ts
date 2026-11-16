/**
 * Measures STARS's AI concern triage against the labelled set in concerns.json.
 *
 *   npx vite-node --config evals/vite.config.mjs evals/triage-eval.ts
 *   EVAL_SET=concerns-touching npx vite-node …   (another set: evals/<name>.json)
 *
 * Each concern goes through the same path as the app: anonymized
 * (src/lib/ai/anonymize.ts), sent to Groq with the app's prompt and schema,
 * parsed, then raised by the safety backstop (withSafetyFloor). Both the
 * model's own urgency and the final one are kept, so the report shows what
 * the backstop adds.
 *
 * Needs GROQ_API_KEY in .env.local (read here; never printed). Groq's free
 * plan allows 8,000 tokens a minute, so concerns are spaced out: 40 take
 * about ten minutes. Results are saved after every concern to
 * evals/output/triage-results.json, and a re-run skips concerns already
 * done (delete the file to start over). The report goes to
 * evals/output/triage-report.md.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*(GROQ_[A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
  if (match) process.env[match[1]] = match[2].trim();
}

const { anonymizeText, nameTokens } = await import("@/lib/ai/anonymize");
const { CONCERN_SUMMARY_JSON_SCHEMA, CONCERN_SYSTEM_PROMPT, buildConcernPrompt, parseConcernSummary, withSafetyFloor } =
  await import("@/lib/ai/concern-summary");
const { aiModels } = await import("@/lib/ai/groq-core");
const { groqJson } = await import("@/lib/ai/groq");

type Urgency = "low" | "medium" | "high" | "critical";
const LEVELS: Urgency[] = ["low", "medium", "high", "critical"];
const rank = (u: string) => LEVELS.indexOf(u as Urgency);

interface Concern {
  id: string;
  lang: string;
  category: string;
  subject: string;
  body: string;
  urgency: Urgency;
  accept: Urgency[];
  dept: string[];
}
interface Result {
  id: string;
  raw?: Urgency;
  final?: Urgency;
  department?: string;
  deptKey?: string;
  summary?: string;
  ms?: number;
  error?: string;
}

const SET = process.env.EVAL_SET ?? "concerns";
const suffix = SET === "concerns" ? "" : `-${SET.replace(/^concerns-/, "")}`;
const set = JSON.parse(fs.readFileSync(path.join(ROOT, `evals/${SET}.json`), "utf8")) as {
  people: Array<{ first: string; last: string }>;
  concerns: Concern[];
};
const OUT = path.join(ROOT, "evals/output");
fs.mkdirSync(OUT, { recursive: true });
const resultsFile = path.join(OUT, `triage-results${suffix}.json`);
const results: Record<string, Result> = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, "utf8")) : {};

/** Sorts the model's free-text office into one of the labels concerns.json uses. Order matters. */
function deptKey(department: string): string {
  const d = department.toLowerCase();
  if (/scholarship|financial assistance|financial aid/.test(d)) return "scholarship";
  if (/guidance|counsel/.test(d)) return "guidance";
  if (/registrar/.test(d)) return "registrar";
  if (/accounting|cashier|finance office/.test(d)) return "cashier";
  if (/security|guard|police/.test(d)) return "security";
  if (/facilit|physical plant|maintenance|engineering services/.test(d)) return "facilities";
  if (/\bmis\b|\bit\b|information tech|ict/.test(d)) return "it";
  if (/college|department|dean|adviser|faculty|library/.test(d)) return "college";
  if (/student affairs|\bosa\b/.test(d)) return "osa";
  return "other";
}

const names = nameTokens(set.people);
const model = aiModels().text;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

for (const concern of set.concerns) {
  if (results[concern.id]?.final) continue;
  const input = {
    category: concern.category,
    subject: anonymizeText(concern.subject, names),
    body: anonymizeText(concern.body, names),
  };
  const started = Date.now();
  const response = await groqJson({
    model,
    system: CONCERN_SYSTEM_PROMPT,
    user: buildConcernPrompt(input),
    schema: { name: "concern_summary", schema: CONCERN_SUMMARY_JSON_SCHEMA },
    maxTokens: 1200,
  });
  const ms = Date.now() - started;
  if (!response.ok) {
    results[concern.id] = { id: concern.id, error: response.failure.message, ms };
    console.log(`${concern.id} ERROR ${response.failure.message}`);
    if (response.failure.hold) break; // the account, not this concern: stop and resume later
  } else {
    const parsed = parseConcernSummary(response.text);
    if (!parsed) {
      results[concern.id] = { id: concern.id, error: "unparseable response", ms };
    } else {
      const final = withSafetyFloor(parsed, input);
      results[concern.id] = {
        id: concern.id,
        raw: parsed.urgency as Urgency,
        final: final.urgency as Urgency,
        department: parsed.suggested_department,
        deptKey: deptKey(parsed.suggested_department),
        summary: parsed.summary,
        ms,
      };
      const ok = concern.accept.includes(final.urgency as Urgency) ? "ok " : "MISS";
      console.log(`${concern.id} ${ok} want ${concern.accept.join("/").padEnd(15)} raw ${parsed.urgency.padEnd(8)} final ${final.urgency.padEnd(8)} ${parsed.suggested_department}`);
    }
  }
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  await pause(9000); // free plan: 8,000 tokens a minute
}

// ---------------------------------------------------------------- report
const done = set.concerns.filter((c) => results[c.id]?.final);
const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");

function score(which: "raw" | "final") {
  const got = (c: Concern) => results[c.id][which]!;
  const correct = done.filter((c) => c.accept.includes(got(c))).length;
  const under = done.filter((c) => rank(got(c)) < Math.min(...c.accept.map(rank))).length;
  const over = done.filter((c) => rank(got(c)) > Math.max(...c.accept.map(rank))).length;
  const crit = done.filter((c) => c.urgency === "critical");
  const critHit = crit.filter((c) => got(c) === "critical").length;
  const flagged = done.filter((c) => got(c) === "critical");
  const flaggedRight = flagged.filter((c) => c.urgency === "critical").length;
  return { correct, under, over, critHit, crit: crit.length, flagged: flagged.length, flaggedRight };
}
const raw = score("raw");
const fin = score("final");

const matrix = LEVELS.map((want) =>
  LEVELS.map((got) => done.filter((c) => c.urgency === want && results[c.id].final === got).length),
);
const byLang = ["en", "fil", "taglish"].map((lang) => {
  const of = done.filter((c) => c.lang === lang);
  return { lang, n: of.length, ok: of.filter((c) => c.accept.includes(results[c.id].final!)).length };
});
const deptOk = done.filter((c) => c.dept.includes(results[c.id].deptKey!)).length;
const times = done.map((c) => results[c.id].ms!).sort((a, b) => a - b);
const median = times.length ? times[Math.floor(times.length / 2)] : 0;
const raisedByFloor = done.filter((c) => results[c.id].raw !== results[c.id].final);
const misses = done.filter((c) => !c.accept.includes(results[c.id].final!));
const errors = set.concerns.filter((c) => results[c.id]?.error && !results[c.id]?.final);

const report = `# AI concern triage: evaluation

Model: \`${model}\` on Groq (free plan), with STARS's prompt, schema and safety backstop. Run ${new Date().toISOString().slice(0, 10)}.
Set: ${set.concerns.length} labelled concerns written by the research team, in \`evals/${SET}.json\`. ${done.length} were scored${errors.length ? `; ${errors.length} failed (listed at the end)` : ""}.

## Urgency

| Measure | Model alone | With the safety backstop (what STARS shows) |
|---|---|---|
| Correct urgency | ${raw.correct}/${done.length} (${pct(raw.correct, done.length)}) | ${fin.correct}/${done.length} (${pct(fin.correct, done.length)}) |
| Under-triaged (rated lower than the label) | ${raw.under} | ${fin.under} |
| Over-triaged (rated higher than the label) | ${raw.over} | ${fin.over} |
| Critical concerns caught (recall) | ${raw.critHit}/${raw.crit} (${pct(raw.critHit, raw.crit)}) | ${fin.critHit}/${fin.crit} (${pct(fin.critHit, fin.crit)}) |
| Concerns rated critical that were critical (precision) | ${raw.flaggedRight}/${raw.flagged} (${pct(raw.flaggedRight, raw.flagged)}) | ${fin.flaggedRight}/${fin.flagged} (${pct(fin.flaggedRight, fin.flagged)}) |

Under-triage is the costly error: a concern that waits when it should not. The prompt tells the model to choose the higher level when in doubt, so some over-triage is by design.

### Confusion matrix (final urgency)

| Label \\ STARS | low | medium | high | critical |
|---|---|---|---|---|
${LEVELS.map((want, i) => `| **${want}** | ${matrix[i].join(" | ")} |`).join("\n")}

(A concern labelled medium but accepted as high, for example, counts as correct above but shows under "high" here.)

### By language

| Language | Correct |
|---|---|
${byLang.map((l) => `| ${l.lang} | ${l.ok}/${l.n} (${pct(l.ok, l.n)}) |`).join("\n")}

## Routing

Suggested office matched one of the acceptable offices for ${deptOk}/${done.length} concerns (${pct(deptOk, done.length)}).

## Speed

Median time for one summary: ${(median / 1000).toFixed(1)} s (slowest ${((times.at(-1) ?? 0) / 1000).toFixed(1)} s).

## What the safety backstop changed

${raisedByFloor.length ? raisedByFloor.map((c) => `- ${c.id} (${c.subject}): model said ${results[c.id].raw}, backstop raised it to critical.`).join("\n") : "- Nothing: the model already rated every concern with a plain safety sign as critical."}

## Misses (final urgency outside the label)

${misses.length ? misses.map((c) => `- **${c.id}** (${c.lang}, label ${c.accept.join("/")}): STARS said **${results[c.id].final}**. "${c.subject}". Summary: ${results[c.id].summary}`).join("\n") : "- None."}
${errors.length ? `\n## Failed requests\n\n${errors.map((c) => `- ${c.id}: ${results[c.id].error}`).join("\n")}\n` : ""}
## Limits of this test

The labels were written by the research team from the OSA's triage rules, not by OSA staff, and the concerns are made up, so the figures show how the triage follows those rules, not how it does on real concerns. The model runs at temperature 0.2, so a repeat run can differ slightly.
`;
fs.writeFileSync(path.join(OUT, `triage-report${suffix}.md`), report);
console.log(`\nScored ${done.length}/${set.concerns.length}. Correct ${fin.correct} (${pct(fin.correct, done.length)}), critical recall ${pct(fin.critHit, fin.crit)}, under-triaged ${fin.under}. Report: evals/output/triage-report${suffix}.md`);
