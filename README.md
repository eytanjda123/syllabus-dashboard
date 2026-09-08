# Coursework — a personal syllabus dashboard

A static site that turns a folder of JSON files (one per course) into a daily "what do I need to do" view. No backend, no build step, no API calls at runtime.

## Run it

**Locally** — browsers block `fetch` on `file://`, so use a server:

```bash
cd syllabus-dashboard
python3 -m http.server 8000
# open http://localhost:8000
```

**Just to look at it** — open `preview.html`. It's a single self-contained file with the sample data, CSS, and script inlined, so it works from disk with no server. It's a snapshot for previewing only; don't deploy it or edit it by hand.

**On GitHub Pages** — push this folder to a repo, then Settings → Pages → deploy from branch, root. It works as-is; everything is same-origin.

## Add or drop a course

1. Put the course JSON in `courses/`.
2. Add its path to the `courses` array in `courses/manifest.json`.

Dropping a course means deleting that one line. Nothing else changes. The Courses page shows what's currently loaded and which file each came from, so you can confirm after an add/drop.

Archiving works the same way: move the file to `archive/`, set `"archived": true`, and list it under `archive` in the manifest. Archived courses never contribute to what's due — they're browsable only.

(GitHub Pages can't list a directory, so the manifest is how the site discovers files. It's the one index you maintain.)

## Views

| | |
|---|---|
| **Due** | Week strip, then the selected day grouped by course. Day / Week / Month toggle. |
| **Courses** | What's loaded, item counts, next thing due, source file. |
| **Office hours & grading** | Reference material per course, deliberately out of the daily feed. |
| **Past semesters** | Archived courses. |

Keyboard: `1` day, `2` week, `3` month (also with Cmd/Ctrl), `←` `→` to move, `T` for today.

The **next 48 hours** bar sits above every view, including inside a course, so nothing gets missed while you're browsing elsewhere. **Further out** flags exams and projects 2–6 weeks away. **While you were away** appears only if you've been gone three days and something slipped past.

## Completion checkboxes

Stored in `localStorage`, per browser. They do not sync across devices, and clearing site data clears them. They are a convenience layer only — the dashboard always computes what's due from the real date, so an unchecked past item never blocks or shifts anything.

Pool assignments ("choose 4 of 12") get a running counter and render quieter than hard deadlines. Expanding one gives you a *Plan to do this one* toggle, tracked separately from completion.

## Item colours

Reading (moss), assignment (ochre), exam (brick), project (slate), deliverable (plum), other (stone). Filled dot = open, hollow = checked off. The month grid's colour layer can be switched off for a plainer calendar.

## Data

See `EXTRACTION-PROMPT.md` for the prompt to run at the start of each semester with your syllabi. The important field pair:

- `summary` — Claude's plain-language version, used in compact views.
- `verbatim` — the professor's exact words, shown when you expand an item. Never paraphrased.

Links carry a `sourceType`. Anything Claude found rather than copied from the syllabus is labelled **found by Claude** in the interface, with a note on what was searched for.

## About the sample files

The three Fall 2026 courses and the archived Spring 2026 course are **fabricated placeholder data** — invented professors, invented syllabus text — so the dashboard has something to show on first load. Delete them when your real files are in.
