"""
Phase 0 discovery: deterministic extraction of the UTS "Important Dates and
Closures 2026-27 School Year" PDF.

Key finding: the PDF is a Google Docs (Skia) export whose embedded Inter subset
maps several punctuation glyphs into the Unicode Private Use Area. A naive
pdftotext/pypdf pass silently DROPS them, which corrupts dates:

    "January 1-3"      -> "January 13"    (wrong day, wrong duration)
    "November 13-16"   -> "November 1316"
    "December 21-31"   -> "December 2131"
    "(Thanksgiving)"   -> " Thanksgiving)"
    "5:30 - 8:30 p.m." -> "530 - 830 p.m."

The PUA codepoints are stable and recoverable, so the import is deterministic
rather than heuristic. Verified against the raw text-draw operands.
"""
import json
import re
from datetime import date

from pypdf import PdfReader

# Recovered by inspecting per-glyph draw operations; see docs/discovery/FINDINGS.md
PUA_REPAIRS = {
    "": "–",  # en dash
    "": "(",
    "": ")",
    "": ":",
}

MONTHS = {
    m: i
    for i, m in enumerate(
        "January February March April May June July August September "
        "October November December".split(),
        start=1,
    )
}
MONTH_HEADER = re.compile(r"^(%s)\s+(20\d{2})$" % "|".join(MONTHS))
DATE_LINE = re.compile(r"^(%s)\s+([0-9].*)$" % "|".join(MONTHS))


def read_lines(pdf_path):
    reader = PdfReader(pdf_path)
    text = "\n".join(p.extract_text(extraction_mode="layout") for p in reader.pages)
    for bad, good in PUA_REPAIRS.items():
        text = text.replace(bad, good)
    text = re.sub(r"[ \t]+", " ", text)
    return [ln.strip() for ln in text.split("\n") if ln.strip()]


def parse_days(month, year, dayspec):
    """Return (dates, kind) for a day specification such as '3', '13-16',
    '5,6 & 9' or '12 - 15'. Ranges are expanded; kind records the source form."""
    spec = dayspec.replace("–", "-").replace("—", "-")
    if re.fullmatch(r"\d+\s*-\s*\d+", spec):
        first, last = (int(n) for n in re.findall(r"\d+", spec))
        return [date(year, month, d) for d in range(first, last + 1)], "range"
    nums = [int(n) for n in re.findall(r"\d+", spec)]
    kind = "multi" if len(nums) > 1 else "single"
    return [date(year, month, d) for d in nums], kind


def parse(pdf_path):
    lines = read_lines(pdf_path)
    events, year, entry = [], None, None
    for line in lines:
        header = MONTH_HEADER.match(line)
        if header:
            year = int(header.group(2))
            entry = None
            continue
        if year is None:
            continue  # title block
        hit = DATE_LINE.match(line)
        if hit:
            month = MONTHS[hit.group(1)]
            dates, kind = parse_days(month, year, hit.group(2))
            entry = {
                "raw_date": line,
                "dates": [d.isoformat() for d in dates],
                "date_kind": kind,
                "title_parts": [],
            }
            events.append(entry)
        elif entry is not None:
            entry["title_parts"].append(line)

    for e in events:
        e["title"] = " ".join(e.pop("title_parts")).strip()
    return events


WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

# "5:30 - 8:30 p.m." / "10 a.m." -- a bare colon is not enough, because titles
# such as "Last Day of School for Students: Exam Review" also contain one.
CLOCK = re.compile(r"\d{1,2}(:\d{2})?\s*[ap]\.?m\.?", re.IGNORECASE)


def annotate(events):
    for e in events:
        days = [date.fromisoformat(d) for d in e["dates"]]
        e["start_date"] = e["dates"][0]
        e["end_date"] = e["dates"][-1]
        e["span_days"] = len(days)
        e["weekdays"] = sorted({WEEKDAYS[d.weekday()] for d in days})
        times = CLOCK.findall(e["title"])
        e["has_explicit_time"] = bool(CLOCK.search(e["title"]))
        # A time in the title may describe an evening event (Curriculum Night)
        # or merely a schedule change ("no students until 10 a.m."), so the
        # importer must not blindly promote it to a timed event.
        e["timed_event_candidate"] = e["has_explicit_time"] and "until" not in e["title"].lower()
    return events


if __name__ == "__main__":
    import sys

    result = annotate(parse(sys.argv[1]))
    print(json.dumps(result, indent=2))
