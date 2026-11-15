# AI accuracy evaluations

Two scripts measure the AI parts of STARS with the app's own code, so the figures describe what the running system does. Both read `GROQ_API_KEY` from `.env.local` and use Groq's free plan, so they cost nothing but are paced to its 8,000-tokens-a-minute limit.

## Concern triage

```bash
npx vite-node --config evals/vite.config.mjs evals/triage-eval.ts
```

Runs the 40 labelled concerns in `concerns.json` (10 per urgency level, in English, Filipino and Taglish) through the same anonymizer, prompt, schema and safety backstop as the app, and writes `output/triage-report.md`: urgency accuracy, under- and over-triage, recall and precision on critical concerns, a confusion matrix, accuracy by language, routing accuracy and speed. It shows the model's own urgency beside the one STARS shows after the backstop. Takes about ten minutes; results are saved after every concern, and a re-run skips the ones already done (delete `output/triage-results.json` to start over).

The labels were written by the team from the urgency rules in `src/lib/ai/concern-summary.ts`. Having OSA staff label the same concerns, or adding real (anonymized) concerns, would make the figures stronger.

## Document reading

```bash
npx vite-node --config evals/vite.config.mjs evals/extraction-eval.ts
```

Needs real documents, so it starts empty:

1. Put CORs and rating slips (PDF, JPG or PNG; the ERS's `rating_slip_main.php` works as a PDF) in `evals/documents/private/`. Git ignores that folder, so the files never reach the repository. The team's own documents, with each member's consent, are enough to start.
2. Copy `documents/labels.example.json` to `documents/private/labels.json` and fill in, for each file, what a careful person reads off the paper: student number, name, term, program, GWA, units and each subject's code, units and grade.
3. Run the script. `output/extraction-report.md` gets the accuracy per field with no personal data; the per-document detail stays in the private folder.

STARS never uses an extraction unchecked (an OSA officer verifies every document), so this measures how much correcting the officer has to do.
