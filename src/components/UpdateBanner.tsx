"use client";

import { useEffect, useState } from "react";
import { feel } from "@/lib/feel/sounds";
import { applyUpdate, checkForUpdate } from "@/lib/liveUpdate";

// Phone app: checks the PC for a newer LifeOS when the app opens or comes back, and offers a restart
// once it is downloaded. Ignoring it is fine: the next launch uses the new version.
export function UpdateBanner() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const onReady = () => (setReady(true), feel("saved"));
    const onShow = () => document.visibilityState === "visible" && void checkForUpdate();
    window.addEventListener("lifeos-update-ready", onReady);
    document.addEventListener("visibilitychange", onShow);
    const first = setTimeout(() => void checkForUpdate(), 2500); // after the page has settled
    return () => (window.removeEventListener("lifeos-update-ready", onReady), document.removeEventListener("visibilitychange", onShow), clearTimeout(first));
  }, []);
  if (!ready) return null;
  return (
    <div className="update-banner" role="status">
      <span>A new version of LifeOS is ready.</span>
      <button type="button" className="chip edit-primary" onClick={() => void applyUpdate()}>
        Restart
      </button>
      <button type="button" className="text-ink-dim" aria-label="Later" onClick={() => setReady(false)}>
        ✕
      </button>
    </div>
  );
}
