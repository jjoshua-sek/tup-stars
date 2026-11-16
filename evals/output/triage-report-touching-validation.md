# AI concern triage: evaluation

Model: `openai/gpt-oss-120b` on Groq (free plan), with STARS's prompt, schema and safety backstop. Run 2026-11-16.
Set: 10 labelled concerns written by the research team, in `evals/concerns-touching-validation.json`. 10 were scored.

## Urgency

| Measure | Model alone | With the safety backstop (what STARS shows) |
|---|---|---|
| Correct urgency | 9/10 (90.0%) | 9/10 (90.0%) |
| Under-triaged (rated lower than the label) | 1 | 1 |
| Over-triaged (rated higher than the label) | 0 | 0 |
| Critical concerns caught (recall) | 6/6 (100.0%) | 6/6 (100.0%) |
| Concerns rated critical that were critical (precision) | 6/6 (100.0%) | 6/6 (100.0%) |

Under-triage is the costly error: a concern that waits when it should not. The prompt tells the model to choose the higher level when in doubt, so some over-triage is by design.

### Confusion matrix (final urgency)

| Label \ STARS | low | medium | high | critical |
|---|---|---|---|---|
| **low** | 2 | 0 | 0 | 0 |
| **medium** | 0 | 1 | 0 | 0 |
| **high** | 0 | 1 | 0 | 0 |
| **critical** | 0 | 0 | 0 | 6 |

(A concern labelled medium but accepted as high, for example, counts as correct above but shows under "high" here.)

### By language

| Language | Correct |
|---|---|
| en | 6/7 (85.7%) |
| fil | 1/1 (100.0%) |
| taglish | 2/2 (100.0%) |

## Routing

Suggested office matched one of the acceptable offices for 6/10 concerns (60.0%).

## Speed

Median time for one summary: 0.8 s (slowest 1.6 s).

## What the safety backstop changed

- Nothing: the model already rated every concern with a plain safety sign as critical.

## Misses (final urgency outside the label)

- **W04** (en, label high/critical): STARS said **medium**. "Classmate keeps kicking my chair". Summary: The student reports that a classmate repeatedly kicks their chair and pushes his desk into theirs during lectures, which has been happening for weeks. The professor has not addressed the behavior, and the student is asking for intervention to stop the harassment.

## Limits of this test

The labels were written by the research team from the OSA's triage rules, not by OSA staff, and the concerns are made up, so the figures show how the triage follows those rules, not how it does on real concerns. The model runs at temperature 0.2, so a repeat run can differ slightly.
