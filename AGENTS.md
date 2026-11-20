# Life OS: rules for contributors and coding agents

Life OS is a **private, local-first display website**. An Obsidian vault is the single source of truth.
The site is built from the vault (static export); a small local Node server edits the vault on request.

## Hard rules
- **The static site never writes to the vault.** Only the local server (`scripts/lifeos-server.mjs`
  with `scripts/lib/*.mjs`) may write, and only to whitelisted fields and sections
  (`scripts/lib/collections.mjs`), after backing up the old file to `<vault>/.lifeos-backup/`. Deletes go to
  `<vault>/_trash/`; replaced images go to `_assets/_old/` first. Requests not from this PC need
  `LIFEOS_TOKEN`. Edit controls appear only when `/api/health` answers.
- The command-line helpers (`add-book`, `add-game`, `add-certificate`, `import-books`, `import-games`)
  only create new notes and images, never overwrite.
- The Android app writes only through the server, from its offline outbox (`src/lib/offline.ts`). Never
  commit an APK or its bundled site (it contains the PC addresses and token, `lifeos-pc.json`).
- **Private data is never built into pages**: daily journal text, weekly review text and week goals,
  tasks, and money amounts are only shown live through the server. From daily notes the build may read only
  habit marks, `> keep:` lines and the frontmatter numbers and times (`productivity`, `screen_time_hours`,
  `pages_read`, `mood`, `sleep_hours`, `bedtime`, `woke`, `played_min`, `missed`). Run
  `npm run check-privacy` after a build.
- `./sample-vault` holds fake data only. Never commit real vault content.
- No database, no login, no analytics, no external network calls at runtime, no CDN fonts or scripts.
  (The command-line helpers call Open Library, Steam and Wikipedia when you run them.)
- three.js only in `src/lib/three/` and the experience components that load it; browser-only (dynamic
  `import()`), colours from CSS variables (`src/lib/three/theme.ts`), paused when hidden, disposed on
  unmount, with the classic page as the fallback (no WebGL, touch, reduced motion).

## Stack
Next.js (App Router, static export), TypeScript (strict), Tailwind v4, gray-matter, three.js (3D only),
Capacitor (Android). Node 20+.

## Style
- Small files, small functions, plain readable code with short comments that explain why.
- Colours live only as CSS variables in `src/app/globals.css`; never hard-code colours in components.
  Each section has a theme there (`brass` default, `arcade`, `minimal`, `gallery`, `trophy`, `dashboard`,
  `home`); a page picks it with `<main data-theme="...">`.
- Never red for missed habits; streaks are forgiving (one grace miss per 7 days) and XP is never taken
  away. Scores: done 1, half 0.5, showed up 0.25, not done 0; not applicable and no entry are left out.
- Always show a placeholder when an image is missing.
- Sounds: local CC0 files in `public/sounds/` (listed in `docs/sounds.md`) or Web Audio; never harsh.
- Nothing personal in defaults: habits, areas, anchors, calendars and rewards are all user settings.

## Before you finish
1. `npm run typecheck`
2. `npm run build` (must pass)
3. `npm run check-privacy`
