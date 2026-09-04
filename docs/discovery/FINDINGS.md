# Phase 0 — School Events PDF: inspection findings

Source: `source/uts-important-dates-2026-27.pdf`
Title metadata: `Important Dates and Closures 2026-27 School Year`
Producer: `Skia/PDF m154 Google Docs Renderer` · 7 pages · not encrypted · no tables (plain text flow)

Machine-readable output: `school-dates-2026-27.json` (regenerate with `extract_school_dates.py`).

---

## 1. Critical finding: the text layer silently corrupts dates

The embedded `Inter` font subset maps four punctuation glyphs into the Unicode
Private Use Area. Standard extraction (`pdftotext`, default `pypdf`) drops them
**with no separator**, which silently produces wrong dates:

| Source text | Naive extraction | Consequence |
|---|---|---|
| `January 1–3` | `January 13` | Wrong day, 3-day break becomes 1 day |
| `November 13–16` | `November 1316` | Unparseable |
| `December 21–31` | `December 2131` | Unparseable |
| `2026–27` | `202627` | School year unparseable |
| `(Thanksgiving)` | ` Thanksgiving)` | Cosmetic |
| `5:30 - 8:30 p.m.` | `530 - 830 p.m.` | Wrong time |

`January 13` is the dangerous one: it parses cleanly as a valid date and would
be imported without any error. Verified at the glyph level via text-draw
operands, which show `'13'`.

Recovered mapping (stable across the document):

| Codepoint | Character | Occurrences |
|---|---|---|
| `U+E088` | `–` en dash | 8 |
| `U+E081` | `(` | 4 |
| `U+E082` | `)` | 3 |
| `U+E092` | `:` | 2 |

**Implication:** the import is *deterministic*, not heuristic — but only if the
PUA repair runs first. Any importer must assert that no `U+E000–U+F8FF`
codepoint survives into a parsed date, and hard-fail if one does.

## 2. Structure

- Flat text, grouped under month headers (`September 2026` … `June 2027`).
- Each entry is a **date line** followed by one or more **description lines**.
- The month header supplies the calendar year. The school year spans two
  calendar years, so **the year cannot be inferred from the month alone** —
  header state must be tracked while parsing.

## 3. Fields actually present

| Field | Present? | Notes |
|---|---|---|
| Date | Yes | Every entry |
| Title | Yes | Free text; category is implied, never labelled |
| Time | **Once only** | `Curriculum Night (5:30 - 8:30 p.m.)`. Everything else is all-day |
| Location | **Never** | No location appears anywhere in the document |
| Category | **Never** | Must be inferred from title patterns |
| Description | Merged into title | Parenthetical, e.g. `(no students in school)` |

17 entries contain a clock time, but 16 are `until 10 a.m.` inside a *schedule
description*, not an event start time. Only 1 is a genuinely timed event.
An importer that treats "title contains a time" as "timed event" is wrong 16/17.

## 4. Date formats observed

| Form | Example | Count |
|---|---|---|
| Single day | `September 8` | 41 |
| En-dash range | `November 13–16`, `June 4–21` | 6 |
| Hyphen range (spaced) | `February 12 - 15` | 1 |
| Non-contiguous list | `November 5,6 & 9`, `February 5 & 8` | 2 |

Note both a spaced ASCII hyphen **and** an en dash are used for ranges, and
`November 5,6 & 9` is **not** a range — days 7 and 8 are excluded. Expanding it
as a range would fabricate two events.

## 5. Validation performed

Every date was checked against its real weekday. The calendar is internally
consistent and matches Ontario statutory holidays:

- All **16 Late Starts fall on a Wednesday** — but only 16 of 42 in-session
  Wednesdays have one. It is a *pattern, not a recurrence rule*; generating a
  weekly RRULE would fabricate 26 events. Store as discrete events, tagged as a
  series.
- `October 12` = Monday (Thanksgiving) ✓ · `May 24` = Monday (Victoria Day) ✓
- `March 26` = Good Friday, `March 29` = Easter Monday 2027 ✓
- `February 15` = Family Day ✓ · `September 30` = Truth and Reconciliation ✓

## 6. Ambiguities and source defects — need confirmation

1. **Winter Break is split across the year boundary.** `December 21–31` and
   `January 1–3` are two entries for one continuous 14-day break, separated only
   because of the month headers. This is a genuine merge candidate and a good
   first test case for the duplicate/merge UI.
2. **`June 4–21 "Exam Week"` spans 18 days.** Labelled "Exam Week" (singular)
   but covers 2.5 weeks. Likely an exam *period*. Needs confirmation.
3. **`March 15–25 "March Break"` spans 11 days**, immediately followed by the
   Easter long weekend `March 26–29` — an effectively continuous 15-day break.
   Plausible but unusual; worth confirming.
4. **`4–Day Long Weekend weekend (Easter)`** — duplicated word in the source.
5. **`PD Day` (7×) vs `PA Day` (3×)** are used inconsistently for what appears
   to be the same thing. Normalise, or preserve the source wording?
6. `September 3` (New Student Orientation) precedes `September 8` (First Day of
   School) — correct, but means "first day" is not the earliest entry.
7. `June 23` is the last day for students, yet 4 PD Days follow (Jun 25–30).
   Staff-only days should probably not surface on a student dashboard.

## 7. Duplicate-detection consequences

The document is a stress test for the dedup design:

- **`Late Start (no students in school until 10 a.m.)` appears 16 times**, and
  `PD Day (no students in school)` 7 times — byte-identical titles on different
  dates. Title-similarity matching alone would collapse these. **The (title,
  date) pair must be the identity key, never the title.**
- Conversely, Winter Break is one event under two entries with *different*
  dates — so date equality alone is also insufficient.
- These two cases pull in opposite directions, which is exactly why the merge
  decision must surface to a human rather than resolve automatically.
