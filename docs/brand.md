# The LifeOS icon

The source is one picture: `docs/brand/lifeos-icon.png`. Dark teal glass,
in the style of the OnePlus/OxygenOS look the app uses.

- **The ring with four gaps and tick marks:** a clock face and a gate: time, and the "Why now?" pause
  before the screen.
- **Three stacked layers:** a life built in layers, one day on top of the other.
- **The check on the top layer:** habits and tasks done.
- **The sparkle:** the ✦ of the LifeOS name.

## Files (run `npm run icons` after changing the picture; scripts/make-icons.ps1, Windows, no packages)
- Web/PC: `public/icons/icon-32.png` (favicon), `icon-192.png`, `icon-512.png`, `maskable-512.png` (installable
  app, edge to edge), `lifeos.ico` (Windows shortcut and LifeOS.exe; rebuild the exe with make-launcher.ps1).
- Android: adaptive icon = `res/drawable-*/ic_launcher_art.png` (the artwork edge to edge, so the phone's
  squircle or circle mask looks right) + `ic_launcher_monochrome.xml` (themed icons); legacy
  `mipmap-*/ic_launcher*.png`; the splash uses the launcher icon.
- Small white icons are simple drawings of the ring and check, not the picture (it turns to mush at
  16-24 px): `res/drawable/ic_stat_lifeos.xml` (notifications, tinted sage) and the monochrome layer.
