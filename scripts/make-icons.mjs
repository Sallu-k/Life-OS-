// The LifeOS mark, "A life, built": one set of shapes written out as every icon the project needs.
// Run: node scripts/make-icons.mjs   (PNG sizes are rendered from public/icons/*.svg, see docs/brand.md)
//
// Idea: a hexagon split into three faces reads as a solid block seen from above.
//  - Flat, it is the six areas of the Balance graph (and the brass hexagon).
//  - In depth, it is something built, day by day: the "OS" is a foundation, not a feed.
//  - Three faces: faith, mind, body, in three shades of brass (brass = what is kept).
//  - Where they meet: a small teal core, the spark (you).
// Icon files cannot read CSS variables, so these repeat the home theme's --bg, --brass and --glow.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const C = { bg: "#121316", bgHi: "#1d2026", ring: "#e4b565", top: "#f3d596", right: "#c8913a", left: "#7a5a2c", core: "#7fe7dc" };

// Pointy-top hexagon around (cx, cy) with radius r: T, UR, LR, B, LL, UL and the centre.
function hex(cx, cy, r) {
  const p = (deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  return { T: p(-90), UR: p(-30), LR: p(30), B: p(90), LL: p(150), UL: p(210), C: [cx, cy] };
}
const f = (n) => Math.round(n * 100) / 100;
const pts = (...ps) => ps.map(([x, y]) => `${f(x)},${f(y)}`).join(" ");
const path = (...ps) => `M${ps.map(([x, y]) => `${f(x)},${f(y)}`).join(" L")} Z`;

// The frame (outer hexagon ring), the three faces set inside it, the seams and the core.
function mark(cx, cy, r, { mono = null } = {}) {
  const outer = hex(cx, cy, r);
  const h = hex(cx, cy, r * 0.74);
  const gap = r * 0.05;
  const fill = (c) => mono ?? c;
  return {
    faces: [
      { d: path(h.T, h.UR, h.C, h.UL), color: fill(C.top), alpha: mono ? 1 : 1 },
      { d: path(h.UR, h.LR, h.B, h.C), color: fill(C.right), alpha: mono ? 0.78 : 1 },
      { d: path(h.UL, h.C, h.B, h.LL), color: fill(C.left), alpha: mono ? 0.56 : 1 },
    ],
    seams: [path(h.C, h.UR), path(h.C, h.UL), path(h.C, h.B)].map((d) => d.replace(/ Z$/, "")),
    gap,
    core: { cx, cy, r: r * 0.12, ring: r * 0.19 },
    frame: { d: path(outer.T, outer.UR, outer.LR, outer.B, outer.LL, outer.UL), width: r * 0.075, color: mono ?? C.ring },
    h,
  };
}

function svg({ size = 512, background = "rounded", r = 168, mono = null }) {
  const m = mark(size / 2, size / 2, r, { mono });
  const bg =
    background === "rounded"
      ? `<defs><radialGradient id="g" cx="50%" cy="30%" r="75%"><stop offset="0" stop-color="${C.bgHi}"/><stop offset="1" stop-color="${C.bg}"/></radialGradient></defs><rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#g)"/>`
      : background === "full"
        ? `<rect width="${size}" height="${size}" fill="${C.bg}"/>`
        : "";
  const gapColor = background === "none" ? "#000" : C.bg;
  const faces = m.faces.map((x) => `<path d="${x.d}" fill="${x.color}"${x.alpha < 1 ? ` fill-opacity="${x.alpha}"` : ""}/>`).join("");
  // With no background the seams are cut out with a mask so they stay transparent.
  if (background === "none") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><mask id="cut"><rect width="${size}" height="${size}" fill="#fff"/>${m.seams.map((d) => `<path d="${d}" stroke="#000" stroke-width="${f(m.gap * 2)}" stroke-linecap="butt"/>`).join("")}<circle cx="${m.core.cx}" cy="${m.core.cy}" r="${f(m.core.ring)}" fill="#000"/></mask><path d="${m.frame.d}" fill="none" stroke="${m.frame.color}" stroke-width="${f(m.frame.width)}" stroke-linejoin="round"/><g mask="url(#cut)">${faces}</g><circle cx="${m.core.cx}" cy="${m.core.cy}" r="${f(m.core.r)}" fill="${mono ?? C.core}"/></svg>`;
  }
  const frame = `<path d="${m.frame.d}" fill="none" stroke="${m.frame.color}" stroke-width="${f(m.frame.width)}" stroke-linejoin="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${bg}${frame}${faces}${m.seams.map((d) => `<path d="${d}" stroke="${gapColor}" stroke-width="${f(m.gap * 2)}" stroke-linecap="butt"/>`).join("")}<circle cx="${m.core.cx}" cy="${m.core.cy}" r="${f(m.core.ring)}" fill="${gapColor}"/><circle cx="${m.core.cx}" cy="${m.core.cy}" r="${f(m.core.r * 2.2)}" fill="${C.core}" fill-opacity="0.18"/><circle cx="${m.core.cx}" cy="${m.core.cy}" r="${f(m.core.r)}" fill="${C.core}"/></svg>`;
}

// Android VectorDrawable of the mark (viewport 108 for launcher layers, 24 for notifications).
function vector({ viewport, r, mono = null, size = viewport }) {
  const m = mark(viewport / 2, viewport / 2, r, { mono });
  const c = viewport / 2;
  const ring = m.core.ring;
  const circle = (rad) => `M${f(c - rad)},${f(c)} a${f(rad)},${f(rad)} 0 1,0 ${f(rad * 2)},0 a${f(rad)},${f(rad)} 0 1,0 ${f(-rad * 2)},0 Z`;
  // Seams are drawn as thin quads cut out of the faces with evenOdd, so the layer stays transparent.
  const seamQuad = ([x1, y1], [x2, y2]) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const nx = (-dy / len) * m.gap;
    const ny = (dx / len) * m.gap;
    return `M${f(x1 + nx)},${f(y1 + ny)} L${f(x2 + nx)},${f(y2 + ny)} L${f(x2 - nx)},${f(y2 - ny)} L${f(x1 - nx)},${f(y1 - ny)} Z`;
  };
  const cut = [seamQuad(m.h.C, m.h.UR), seamQuad(m.h.C, m.h.UL), seamQuad(m.h.C, m.h.B), circle(ring)].join(" ");
  const faces = m.faces
    .map((x) => `  <path android:fillType="evenOdd" android:fillColor="${x.color}"${x.alpha < 1 ? ` android:fillAlpha="${x.alpha}"` : ""} android:pathData="${x.d} ${cut}"/>`)
    .join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/make-icons.mjs: the LifeOS mark ("A life, built"). Do not edit by hand. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
  android:width="${size}dp" android:height="${size}dp"
  android:viewportWidth="${viewport}" android:viewportHeight="${viewport}">
  <path android:strokeColor="${m.frame.color}" android:strokeWidth="${f(m.frame.width)}" android:strokeLineJoin="round" android:pathData="${m.frame.d}"/>
${faces}
  <path android:fillColor="${mono ?? C.core}" android:pathData="${circle(m.core.r)}"/>
</vector>
`;
}

const out = (file, text) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  console.log("wrote", file);
};

// Web / PC
out("public/icons/lifeos.svg", svg({}));
out("public/icons/maskable.svg", svg({ background: "full", r: 140 }));
// The favicon is src/app/favicon.ico (copied from public/icons/lifeos.ico) plus public/icons/lifeos.svg.

// Android launcher (adaptive: background colour + vector foreground + monochrome for themed icons)
const res = "android/app/src/main/res";
out(`${res}/drawable/ic_launcher_foreground.xml`, vector({ viewport: 108, r: 27 }));
out(`${res}/drawable/ic_launcher_monochrome.xml`, vector({ viewport: 108, r: 27, mono: "#FFFFFFFF" }));
out(`${res}/drawable/ic_stat_lifeos.xml`, vector({ viewport: 24, r: 10.5, mono: "#FFFFFFFF" }));
out(`${res}/drawable/ic_splash.xml`, vector({ viewport: 108, r: 30 }));
out(`${res}/values/ic_launcher_background.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${C.bg}</color>\n</resources>\n`);
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>
`;
out(`${res}/mipmap-anydpi-v26/ic_launcher.xml`, adaptive);
out(`${res}/mipmap-anydpi-v26/ic_launcher_round.xml`, adaptive);
