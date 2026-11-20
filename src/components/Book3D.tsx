import { titleAccent, titleHash } from "./Cover";

// Wraps a cover in a CSS-only 3D book: front face, spine and page edges. No WebGL.
// The spine colour comes from the title and the palette variables.
export function Book3D({ title, children }: { title: string; children: React.ReactNode }) {
  const amount = 35 + (titleHash(title) % 35); // 35%..69%
  const style = { "--spine": `color-mix(in srgb, ${titleAccent(title)} ${amount}%, var(--surface))` } as React.CSSProperties;

  return (
    <div className="book3d-scene">
      <div className="book3d" style={style}>
        <div className="book3d-front">{children}</div>
        <div className="book3d-spine" aria-hidden="true" />
        <div className="book3d-pages" aria-hidden="true" />
      </div>
    </div>
  );
}
