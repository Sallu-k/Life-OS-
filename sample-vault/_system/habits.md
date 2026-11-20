---
type: habits
habits:
  - id: walk
    label: Morning walk
    active: true
    area: health
    level: 3
  - id: practice
    label: Practice
    active: true
    area: knowledge
    target: 20 minutes
  - id: focus
    label: Deep focus
    active: true
    area: work
  - id: lights-out
    label: Lights out on time
    active: true
    area: health
---
Habit ids are permanent. Rename by changing `label` only. Retire a habit with `active: false`.
Optional fields: `area` (an id from `_system/areas.md`), `level` (a whole number you set yourself),
`days` (daily, weekdays, weekends or a list like [mon, wed]), `time` (reminder), `difficulty`
(easy, medium, hard), `target` (shown as a note), `after` + `offset` (follow an anchor from Settings),
`core: true` + `weekly: 5` (a core habit: double XP and a weekly target).
These four are only examples: replace them with your own in Today > Set up habits.
