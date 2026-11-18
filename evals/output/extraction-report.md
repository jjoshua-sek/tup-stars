# AI document reading: evaluation

Run 2026-11-18 on 10 labelled documents (8 rating slips, 2 CORs); 10 were read. Each was read with STARS's own extraction (Groq: a photo with the vision model, a PDF from its text layer) and compared field by field with what a person read off the paper. Names match in any word order; subject rows are paired ignoring dashes and underscores in the code, and the exact code is scored separately.

| Field | Correct |
|---|---|
| student_number | 10/10 (100.0%) |
| student_name | 8/10 (80.0%) |
| school_year | 10/10 (100.0%) |
| semester | 10/10 (100.0%) |
| program | 10/10 (100.0%) |
| gwa | 8/8 (100.0%) |
| units_enrolled | 10/10 (100.0%) |
| subject row found | 82/82 (100.0%) |
| subject code exact | 80/82 (97.6%) |
| subject units | 82/82 (100.0%) |
| subject grade | 62/70 (88.6%) |
| rating slip entirely right | 4/8 (50.0%) |
| college | 2/2 (100.0%) |
| class meeting (day and times) | 12/12 (100.0%) |
| COR entirely right | 0/2 (0.0%) |

By way of reading: PDF text 2/4 documents entirely right, photos 2/6.

Mean confidence the AI reported: 0.95 on documents it read entirely right, 0.92 on the rest.

## What it got wrong

- A rating slip read as PDF text: PATHFIT4-M: grade 4.
- A rating slip read as PDF text: IT303--M: code read as "IT303-M".
- A rating slip read as a photo: CC303-M: grade undefined; GEE11D-M: grade undefined; IT303--M: grade undefined; IT323: grade undefined; IT343_M: grade undefined; IT363-M: grade undefined; ITE4-M: grade undefined.
- A rating slip read as a photo: IT312--M: code read as "IT312-M".
- A COR read as a photo: student_name read differently.
- A COR read as a photo: student_name read differently.

STARS never uses these figures unchecked: every document is verified by an OSA officer on screen or against the Registrar-stamped copy before it counts (W7). This measures how much correcting the officer has to do.
