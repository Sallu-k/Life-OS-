"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { HubEntry } from "@/lib/three/portalHub";
import { hasMouse, prefersReducedMotion, webglAvailable } from "@/lib/three/support";

// The 3D portal hub at the top of the Home page. It only appears when this computer can show it
// (WebGL, a mouse, motion welcome); otherwise the page shows just the tiles below it, which hold the same links.
export function HomeHub({ entries }: { entries: HubEntry[] }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShow(webglAvailable() && hasMouse() && !prefersReducedMotion());
  }, []);

  useEffect(() => {
    if (!show || !boxRef.current) return;
    const container = boxRef.current;
    let hub: { dispose(): void } | null = null;
    let cancelled = false;
    import("@/lib/three/portalHub").then(({ createPortalHub }) => {
      if (cancelled) return;
      hub = createPortalHub({
        container,
        entries,
        still: prefersReducedMotion(),
        onEnter: (href) => router.push(href),
        onHover(info) {
          const tip = tipRef.current;
          if (!tip) return;
          if (!info) {
            tip.style.display = "none";
            return;
          }
          const rect = container.getBoundingClientRect();
          tip.style.display = "block";
          tip.style.transform = `translate(${Math.round(info.x - rect.left + 16)}px, ${Math.round(info.y - rect.top + 16)}px)`;
          tip.children[0].textContent = info.title;
          tip.children[1].textContent = info.sub;
        },
      });
    });
    return () => {
      cancelled = true;
      hub?.dispose();
    };
  }, [show, entries, router]);

  if (!show) return null;
  return (
    <div className="hub mb-10" aria-hidden="true">
      <div ref={boxRef} className="hall-canvas" />
      <div ref={tipRef} className="hall-tip" style={{ display: "none" }}>
        <strong />
        <span />
      </div>
      <p className="hall-hint">Drag to turn · click a portal to enter</p>
    </div>
  );
}
