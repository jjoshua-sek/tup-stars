# AI concern triage: evaluation

Model: `openai/gpt-oss-120b` on Groq (free plan), with STARS's prompt, schema and safety backstop. Run 2026-11-15.
Set: 40 labelled concerns written by the research team (10 per urgency level; English, Filipino and Taglish), in `evals/concerns.json`. 40 were scored.

## Urgency

| Measure | Model alone | With the safety backstop (what STARS shows) |
|---|---|---|
| Correct urgency | 37/40 (92.5%) | 37/40 (92.5%) |
| Under-triaged (rated lower than the label) | 2 | 2 |
| Over-triaged (rated higher than the label) | 1 | 1 |
| Critical concerns caught (recall) | 9/10 (90.0%) | 9/10 (90.0%) |
| Concerns rated critical that were critical (precision) | 9/9 (100.0%) | 9/9 (100.0%) |

Under-triage is the costly error: a concern that waits when it should not. The prompt tells the model to choose the higher level when in doubt, so some over-triage is by design.

### Confusion matrix (final urgency)

| Label \ STARS | low | medium | high | critical |
|---|---|---|---|---|
| **low** | 9 | 1 | 0 | 0 |
| **medium** | 0 | 10 | 0 | 0 |
| **high** | 0 | 1 | 9 | 0 |
| **critical** | 0 | 0 | 1 | 9 |

(A concern labelled medium but accepted as high, for example, counts as correct above but shows under "high" here.)

### By language

| Language | Correct |
|---|---|
| en | 24/27 (88.9%) |
| fil | 5/5 (100.0%) |
| taglish | 8/8 (100.0%) |

## Routing

Suggested office matched one of the acceptable offices for 38/40 concerns (95.0%).

## Speed

Median time for one summary: 0.9 s (slowest 1.9 s).

## What the safety backstop changed

- Nothing: the model already rated every concern with a plain safety sign as critical.

## Misses (final urgency outside the label)

- **C07** (en, label critical): STARS said **high**. "Professor touched me during consultation". Summary: The student reports that during a one-on-one consultation in the professor's faculty room, the professor placed his hand on the student's thigh and asked them to return alone after class for a grade. The student left immediately and has another class with the professor on Thursday. They are seeking appropriate action and protection.
- **H05** (en, label high): STARS said **medium**. "My scholarship was cut by mistake". Summary: The student received a notice that their Tulong Dunong grant was terminated due to alleged GWA issues, but their actual GWA is 1.75, which meets the requirement. They are requesting clarification and reinstatement of the scholarship before the payout list is finalized this week.
- **L07** (en, label low): STARS said **medium**. "Longer library hours". Summary: The student requests that the library extend its operating hours until 8 PM during exam weeks because many students lack a quiet place to study at home. They are asking for a change in the library schedule to accommodate this need.

## Limits of this test

The labels were written by the research team from the OSA's triage rules, not by OSA staff, and the concerns are made up, so the figures show how the triage follows those rules, not how it does on real concerns. The model runs at temperature 0.2, so a repeat run can differ slightly.
