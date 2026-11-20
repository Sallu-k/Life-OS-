"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hasMouse, prefersReducedMotion, webglAvailable } from "@/lib/three/support";
import { Chip } from "./Chip";

type Mode = "scene" | "classic";

// What every 3D scene gives back: a way to fly to a group (or back out) and a way to clean up.
export interface SceneHandle {
  focus(group: string | null): void;
  dispose(): void;
}

// What the shell gives to every 3D scene when it starts it.
export interface SceneCallbacks {
  container: HTMLElement;
  still: boolean; // reduced motion: nothing drifts or spins
  onHover(info: { title: string; sub: string; x: number; y: number } | null): void;
  onFocus(group: string | null): void; // the visitor clicked a group in the scene
}

interface Props {
  storageKey: string; // remembers the Scene | Classic choice per section
  sceneLabel: string; // the toggle's name for the 3D view, e.g. "Hall"
  label: string; // what the scene region is called for screen readers
  hint: string; // the small line shown in the top-left corner
  groups: string[]; // the clickable groups (shelves, genres...), also shown as chips under the scene
  start(callbacks: SceneCallbacks): Promise<SceneHandle>; // loads three.js and builds the scene
  classic: React.ReactNode; // the normal page, shown when 3D is off or not possible
  panel(group: string): React.ReactNode; // what opens beside the scene for a group
  panelTitle(group: string): React.ReactNode;
  overlay?: React.ReactNode; // something the scene can open on top, e.g. a viewer dialog
}

// The shared frame around every 3D section: decides whether 3D can run, the Scene | Classic toggle,
// the tooltip, the group chips, the side panel and the Escape key. Each section only supplies its scene and lists.
export function SceneShell({ storageKey, sceneLabel, label, hint, groups, start, classic, panel, panelTitle, overlay }: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [capable, setCapable] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const handle = useRef<SceneHandle | null>(null);
  const startRef = useRef(start);
  startRef.current = start;

  // Decide once, in the browser: 3D needs WebGL and a mouse. Motion-sensitive visitors start on Classic.
  useEffect(() => {
    const ok = webglAvailable() && hasMouse();
    setCapable(ok);
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(storageKey);
    } catch {
      // Storage blocked: use the default.
    }
    const wantsScene = saved === "scene" || saved === "hall" || (saved !== "classic" && !prefersReducedMotion());
    setMode(ok && wantsScene ? "scene" : "classic");
  }, [storageKey]);

  function chooseMode(next: Mode) {
    setOpen(null);
    setMode(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // Storage blocked: the choice lasts for this visit only.
    }
  }

  // Start and stop the scene together with the "scene" mode.
  useEffect(() => {
    if (mode !== "scene" || !boxRef.current) return;
    let cancelled = false;
    const container = boxRef.current;
    startRef
      .current({
        container,
        still: prefersReducedMotion(),
        onFocus: setOpen,
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
      })
      .then((h) => {
        if (cancelled) h.dispose();
        else handle.current = h;
      });
    return () => {
      cancelled = true;
      handle.current?.dispose();
      handle.current = null;
    };
  }, [mode]);

  const openGroup = useCallback((group: string | null) => {
    handle.current?.focus(group);
    setOpen(group);
  }, []);

  // Escape closes the open group.
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") openGroup(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openGroup]);

  if (mode === null) return <div className="hall-placeholder" aria-hidden="true" />;

  const toggle = capable && (
    <div className="mb-4 flex justify-end gap-2" role="group" aria-label="View">
      <Chip pressed={mode === "scene"} onClick={() => chooseMode("scene")}>
        {sceneLabel}
      </Chip>
      <Chip pressed={mode === "classic"} onClick={() => chooseMode("classic")}>
        Classic
      </Chip>
    </div>
  );

  if (mode === "classic") {
    return (
      <>
        {toggle}
        {classic}
      </>
    );
  }

  return (
    <>
      {toggle}
      <div className="hall" role="region" aria-label={label}>
        <div ref={boxRef} className="hall-canvas" aria-hidden="true" />
        <div ref={tipRef} className="hall-tip" style={{ display: "none" }} aria-hidden="true">
          <strong />
          <span />
        </div>
        {open === null && <p className="hall-hint">{hint}</p>}

        <div className="hall-shelves" role="group" aria-label="Groups">
          {groups.map((g) => (
            <Chip key={g} pressed={open === g} onClick={() => openGroup(open === g ? null : g)}>
              {g}
            </Chip>
          ))}
        </div>

        {open !== null && (
          <aside className="hall-panel" aria-label={open}>
            <div className="mb-5 flex items-baseline justify-between gap-4">
              <h2 className="font-serif text-2xl text-ink">{panelTitle(open)}</h2>
              <button type="button" className="chip" onClick={() => openGroup(null)}>
                Close
              </button>
            </div>
            {panel(open)}
          </aside>
        )}
      </div>
      {overlay}
    </>
  );
}
