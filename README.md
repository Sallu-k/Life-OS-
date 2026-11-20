# Life OS

A private, local-first dashboard for your life, built on an [Obsidian](https://obsidian.md) vault.
Your notes stay plain Markdown files on your own computer; Life OS reads them and shows them as a
calm website, a daily screen to work from, and (optionally) an Android app that syncs with your PC.

No account, no cloud, no database, no analytics. Nothing leaves your machine unless you send it.

## What it does

**Every day**
- **Today**: due habits (done, half, showed up, not done, not applicable), mood and sleep, a few numbers
  (productivity, screen time, pages read), a fun log, a private journal, and quick capture to an Inbox.
  A day can be finished and then locks itself, so the record stays honest.
- **Plan**: tasks on days, in a week or a month without a day, or "someday". Type them in one line
  (`Call the bank tomorrow 5pm !high every week`), add steps and notes, deadlines, start dates, repeats
  (weekdays, every N weeks, from completion), and goals for the year, month and week.
- **Anchors**: name the fixed points of your day ("Wake up 06:30", "After work 18:00") and let habits
  and tasks follow them ("15 minutes after Wake up").
- **Reminders** (phone app): habits, tasks, deadlines and an evening wind-down, with Done and Snooze buttons.

**Looking back**
- **Habits**: a heat map per habit and the whole year in squares. Missed days are simply empty, never red.
- **Life areas**: a spider graph of the areas you define (health, work, people…), month by month.
- **Insights**: patterns in your own numbers, each with how many days it rests on.
- **Weekly review**: the week's numbers plus three short answers, saved as a note.
- **Money** (optional): log money that comes in and, once a week, how much is left. What the week cost is
  worked out for you; purchases are never itemised.

**Collections**
- **Library**, **Games**, **Certificates** and **Achievements**, each with its own look, and optional 3D
  rooms (a library hall, an arcade, a gallery) when the computer can show them.
- Command-line helpers fetch book covers (Open Library) and game art (Steam) into new notes.

**Motivation (optional, can be switched off)**
- XP and levels that are never taken away, forgiving streaks (one missed day a week is fine),
  **core habits** with a weekly target, a **monthly challenge** to beat your usual month, and
  **reward time**: minutes of something you enjoy, earned by the habits you choose.

**Optional extras**
- A second calendar beside the date (Hebrew, Islamic, Chinese, Persian, Indian national, …) with a
  ±day correction for local differences.
- Phone-measured bedtime: the Android app sees when its screen went off for the night and can tick a
  bedtime habit for you.

## Quick start (sample data)

Needs [Node.js](https://nodejs.org) 20 or newer.

```sh
npm install
npm run dev        # http://localhost:3000, showing the fake ./sample-vault
```

## Use your own vault

1. Copy `.env.example` to `.env.local` and set `VAULT_PATH` to your vault folder (forward slashes on
   Windows, e.g. `D:/Vaults/Life`).
2. Start from the folder layout of `sample-vault/` (see below) and the templates in `docs/vault-templates/`.
3. Run the local server, which serves the site and lets the pages edit your vault:

```sh
npm run build
npm start          # http://127.0.0.1:4173
```

On first start the server writes a random `LIFEOS_TOKEN` to `.env.local`; other devices need it to edit.

### Vault layout

```
Collections/Books/*.md  Games/*.md  Certificates/*.md  Achievements/*.md
Daily/YYYY-MM-DD.md       habits, numbers, tasks, fun, journal (private)
Journal/YYYY-MM.md        month goals, ideas, fun, books read      (Journal/YYYY.md: year goals)
Weekly/YYYY-Www.md        weekly review and week goals (private)
Tasks/Someday.md          tasks without a date
Finance/YYYY-MM.md        money in and weekly checks (private, optional)
Inbox/ Brainstorm/ Projects/ Templates/
_assets/                  covers, posters, certificate files
_system/habits.md         your habits      _system/areas.md         your life areas
_system/settings.md       settings (written by the Settings page)
_system/library.md        shelf order (optional)    _system/certificates.md  certificate stages (optional)
```

Everything is ordinary Markdown with frontmatter, so you can edit it in Obsidian at any time.

## Privacy model

- The built site is **read-only**; only the local server (`npm start`) writes to the vault, only to known
  fields and sections, and it backs up every file before changing it (`<vault>/.lifeos-backup/`).
  Deletes go to `<vault>/_trash/`.
- Journal text, weekly review answers, tasks and money amounts are **never built into pages**. They are
  only shown live by the server. `npm run check-privacy` checks a build for journal text.
- The server answers this PC fully; devices on your home network or [Tailscale](https://tailscale.com)
  get the API only, with the token. Set `LIFEOS_LAN=off` in `.env.local` to allow Tailscale only.
- Do not expose the server to the internet. `out/` and snapshots contain your images: do not share them.

## Phone app (Android, optional)

The Android app is the same site packaged with [Capacitor](https://capacitorjs.com). It works offline,
queues your changes, and sends them to your PC when it can reach it. It adds reminders with
Done/Snooze buttons, two home-screen widgets (habits and tasks), phone screen time and measured bedtime,
and it updates itself from your PC without reinstalling.

Needs Android Studio (SDK and JDK). Then:

```sh
npm run app:android    # builds the site and the APK -> LifeOS-app.apk
```

The APK contains your PC's addresses and token, so keep it to yourself (it is ignored by git).

## Windows helpers (optional)

- `Setup LifeOS.cmd`: one-time setup that adds a Life OS shortcut to the Desktop and Start menu and starts
  the server when you sign in. `Remove LifeOS.cmd` undoes it.
- Settings has a weekly vault backup (a zip in a folder you choose).
- `scripts/rebuild.ps1`, `scripts/snapshot.ps1`, `scripts/backup-vault.ps1`: build and serve, zip the
  built site, copy the vault to a dated folder.

## Adding notes from the command line

These create a **new** note (never overwrite) and download images:

```sh
npm run add-book -- 9780141439518                 # by ISBN or title (Open Library)
npm run add-game -- "Outer Wilds" "PC"            # poster and banner from Steam
npm run add-certificate -- "course.pdf" "First Aid Course" "Example Centre" technical
npm run import-books -- books.json                # many at once (format at the top of the script)
npm run import-games -- games.json
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Develop at http://localhost:3000 |
| `npm run build` | Static export to `out/` |
| `npm start` | Local server: serves the last good build and the editing API on port 4173 |
| `npm run typecheck` | Type check |
| `npm run check-privacy` | After a build: make sure no journal text ended up in `out/` |
| `npm run app:android` | Build the Android app |

## Built with

Next.js (static export), TypeScript, Tailwind CSS, gray-matter, three.js for the 3D rooms, and Capacitor
for Android. Sounds are CC0 (see `docs/sounds.md`).

## License

[MIT](LICENSE)
