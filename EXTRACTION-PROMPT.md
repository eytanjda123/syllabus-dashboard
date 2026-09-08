# Semester-start extraction prompt

Paste everything in the code block below into a fresh Claude conversation along with your syllabi. Reuse it every semester. The schema is filled in — nothing left to paste separately.

---

```
I'm going to give you one or more course syllabi (as PDFs or pasted text). For each course, extract its content into a JSON file matching the exact schema below, to be used by a personal dashboard website I've built.

For each syllabus, before you finalize the JSON:

1. If the syllabus covers multiple sections/groups, ask me which section applies to me, and only extract items relevant to that section.
2. Read the syllabus's general/definitions section first (e.g. what "individual assignment" or "participation" means for this course) and populate the `definitions` field — then when the week-by-week schedule references those terms, make sure you understand what they mean rather than treating them as opaque labels.
3. Capture EVERYTHING with a date or deadline as an item: readings, assignments, exams, projects, deliverables — don't skip anything, and don't force things into categories that don't fit; use "other" if needed.
4. For each item, write a short plain-language `summary` in your own words, AND separately copy the professor's exact original text verbatim into the `verbatim` field — no paraphrasing, no cleanup, word for word as written in the syllabus.
5. Preserve every working hyperlink from the PDF exactly as given, tagged `sourceType: "original"`.
6. If a reading/resource is referenced by name only with no link (e.g. "NYT article on X" or a book title), search for it and provide a link, tagged `sourceType: "claude-found"` with a brief note on what you searched for. I have full Yale library access, so for academic articles and books, prefer finding them via a library/database link where possible over a paywalled public link.
7. If an assignment is a "complete N of M" pool (e.g. one assignment offered every week, only 4 of 15 required), group all instances under a shared `poolId` with `requiredCount` and `totalOptions` set, rather than listing them as 15 separate hard deadlines.
8. Capture class meeting times/dates in `classSessions`, and flag any session that deviates from the normal weekly pattern (guest lecture, rescheduled session, room change) in its `note` field.
9. Capture time-of-day wherever the syllabus specifies it, not just the date.
10. VERIFICATION STEP — before giving me the final JSON, re-read your extracted output against the original syllabus text one more time, specifically checking: (a) no invented dates or assignments that aren't actually in the source, (b) verbatim fields are truly word-for-word matches, (c) nothing meaningful was skipped. Tell me briefly what you checked and confirm it passes, or flag anything you're unsure about.

Output one complete JSON file per course, using this schema:

{
  "courseId": "string, unique slug — this becomes the filename",
  "courseName": "string",
  "professor": "string",
  "section": "string or null — which section/group this data applies to, if the syllabus has multiple",
  "semester": "e.g. Fall 2026",
  "archived": false,

  "definitions": {
    "individualAssignment": "plain text explanation of what this term means for this course, pulled from the syllabus's general policies section",
    "participation": "...",
    "...": "any other term the syllabus defines generally and then references later by name"
  },

  "gradingPolicy": "text summary of how the course is graded",

  "officeHours": {
    "note": "e.g. 'By appointment only — email to schedule'",
    "details": "any scheduled recurring hours if they exist"
  },

  "classSessions": [
    {
      "date": "YYYY-MM-DD",
      "time": "HH:MM (24-hour) or null if not specified",
      "topic": "string",
      "note": "e.g. 'Guest lecture — moved from usual room' — use this field to flag any session that deviates from the default weekly pattern, otherwise null"
    }
  ],

  "items": [
    {
      "id": "unique string within this course",
      "type": "reading | assignment | exam | project | deliverable | other",
      "date": "YYYY-MM-DD",
      "time": "HH:MM (24-hour) or null",
      "summary": "short, plain-language, Claude-written summary for compact views (day tile, week strip)",
      "verbatim": "exact copy-pasted original text from the syllabus describing this item — no paraphrasing, no summarizing, word for word",
      "link": {
        "url": "string or null",
        "sourceType": "original | claude-found | none",
        "note": "if claude-found, briefly say what was searched for and why (e.g. 'NYT article referenced by title only — no link in syllabus'), otherwise null"
      },
      "pool": {
        "isPool": false,
        "poolId": "string, links related pool items together, null if not a pool item",
        "requiredCount": "e.g. 4, null if not a pool item",
        "totalOptions": "e.g. 15, null if not a pool item"
      },
      "completed": false,
      "poolSelected": false
    }
  ]
}

Notes on the fields, so the output loads correctly:
- Times are 24-hour ("13:00", not "1:00pm"). An item with no time is treated as due end of day.
- Every item needs a valid `date` — items without one are dropped by the site.
- `type` must be one of the six listed values exactly; anything else is treated as "other".
- Always include the full `link` and `pool` objects even when empty, with nulls in the unused fields.
- Leave `completed` and `poolSelected` as false; the site tracks those itself.

Ask me for my section/group if relevant, and ask me anything else you need clarified before finalizing. Once I confirm, give me the final JSON as a code block I can save directly as a file.
```

---

## After you get the JSON back

1. Save each course as `courses/<courseId>.json`.
2. Add the path to the `courses` array in `courses/manifest.json`.
3. Commit and push.
