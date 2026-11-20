# Sounds

LifeOS answers inputs with short sounds (code in `src/lib/feel/`). Two kinds:

## Recorded taps — `public/sounds/`
From Kenney's *Interface Sounds* pack (CC0 1.0, public domain; see `public/sounds/LICENSE-kenney.txt`).
Trimmed, mono, normalised to -3 dB peak with a 3 ms fade-out. Picked by measurement: short, warm (low
spectral centroid) and with a clean attack.

| File | From | Used for |
|---|---|---|
| tap.wav | click_003 | habit marks, task done |
| select.wav | select_002 | choosing a kind, n/a mark, moving a task |
| toggle.wav | switch_005 | switches |
| tick.wav | tick_002 | rating stars (pitch rises per star) |
| open.wav / close.wav | maximize_007 / minimize_007 | the edit drawer |
| drop.wav | drop_002 | adding a task, fun item or image |
| glass.wav | glass_006 | "showed up" mark |
| back.wav | back_002 | undo, remove, "not done" (quiet) |

## Made in code — `src/lib/feel/sounds.ts`
Web Audio synth notes in one key (D major pentatonic), soft attack, exponential decay, a small
generated room reverb and a limiter. Good things rise in pitch; frequent sounds are short and quiet,
rare rewards are richer. There is no harsh "wrong" sound.

Measured (full volume, offline render): taps 10-35 ms; marks 80-240 ms (done -17 dB > half -25 >
showed up / not done -28); task done 290 ms; fun 140-410 ms (story game the fullest); all done
0.8 s; level up 1.3 s; rank up 1.9 s. Nothing clips. Check again with `/settings/?feeltest` and
`window.__renderFeel(name)` in the browser console.

Settings (per device): sound on/off, volume, vibration on the phone. Animations follow the system's
"reduce motion".
