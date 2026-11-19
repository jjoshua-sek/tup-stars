# AI document reading: evaluation

Run 2026-11-19 on 12 labelled documents (8 rating slips, 4 CORs); 12 were read. Each was read with STARS's own extraction (Groq: a photo with the vision model, a PDF from its text layer) and compared field by field with what a person read off the paper. Names match in any word order; subject rows are paired ignoring dashes and underscores in the code, and the exact code is scored separately.

| Field | Correct |
|---|---|
| student_number | 12/12 (100.0%) |
| student_name | 8/12 (66.7%) |
| school_year | 12/12 (100.0%) |
| semester | 12/12 (100.0%) |
| program | 12/12 (100.0%) |
| gwa | 8/8 (100.0%) |
| units_enrolled | 12/12 (100.0%) |
| subject row found | 88/94 (93.6%) |
| subject code exact | 86/88 (97.7%) |
| subject units | 88/88 (100.0%) |
| subject grade | 62/70 (88.6%) |
| rating slip entirely right | 4/8 (50.0%) |
| college | 2/4 (50.0%) |
| class meeting (day and times) | 18/18 (100.0%) |
| COR entirely right | 0/4 (0.0%) |

By way of reading: PDF text 2/4 documents entirely right, photos 2/8.

Mean confidence the AI reported: 0.95 on documents it read entirely right, 0.88 on the rest.

## What it got wrong

- A rating slip read as PDF text: PATHFIT4-M: grade 4.
- A rating slip read as PDF text: IT303--M: code read as "IT303-M".
- A rating slip read as a photo: CC303-M: grade undefined; GEE11D-M: grade undefined; IT303--M: grade undefined; IT323: grade undefined; IT343_M: grade undefined; IT363-M: grade undefined; ITE4-M: grade undefined.
- A rating slip read as a photo: IT312--M: code read as "IT312-M".
- A COR read as a photo: student_name read differently.
- A COR read as a photo: student_name read differently.
- A COR read as a photo: student_name read differently; college: read "".
- A COR read as a photo: student_name read differently; college: read ""; GEE12D-M: row missing; GEE13D-M: row missing; GEM14-M: row missing; IT413-M: row missing; IT433-M: row missing; IT453-M: row missing; extra row "ITC130-M"; extra row "IED110-M"; extra row "IED120-M"; extra row "GEM144-M"; extra row "ITC153-M"; extra row "ITC240-M"; extra row "ITC250-M".

STARS never uses these figures unchecked: every document is verified by an OSA officer on screen or against the Registrar-stamped copy before it counts (W7). This measures how much correcting the officer has to do.
