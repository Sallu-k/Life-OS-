# Obsidian templates

Copy these into your real vault's `Templates/` folder, then in Obsidian:
Settings -> Core plugins -> Templates -> Template folder location = `Templates`.
Settings -> Daily notes -> New file location = `Daily`, Date format = `YYYY-MM-DD`, Template file = `Templates/Daily`.

Habit ids in Daily.md (walk, practice, focus, lights-out) are examples: change them to match `_system/habits.md`.
Use lowercase-kebab-case file names, e.g. `the-brass-orchard.md`.

`area:` in Achievement, Brainstorm and Project is an id from `_system/areas.md` (the sample has health, knowledge, work, finance, people, fun). Achievements use it on the Life areas page; Brainstorm and Project keep it for later.

`Month.md` is for `Journal/YYYY-MM.md` (create one each month): Goals (☐ ◐ ☑ ☒), Ideas, Fun (trips, outings, games; start a line with a date to count that week) and Books read. Daily notes can also have a `## Fun` list. Both Fun sections are shown on the Life areas page, so keep them short.

Plan page (no template needed, Life OS creates these; full task format in scripts/lib/tasks.mjs): tasks live in their day's `## Tasks` (add `⚑` for a deadline, e.g. `- [ ] Submit report ⏰ 10:00 ⚑`); tasks without a date in `Tasks/Someday.md`; year goals in `Journal/YYYY.md` and week goals in `Weekly/YYYY-Www.md`, both under `## Goals` with the same ☐ ◐ ☑ ☒ lines as month notes.
