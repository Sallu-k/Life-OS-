"use client";

import { useEffect, useState } from "react";
import { api, useIsApp } from "@/lib/api";
import { applyAccent } from "@/lib/accent";
import { feel } from "@/lib/feel/sounds";

// The accent colour of the everyday pages (Oxygen theme). The phone app takes its wallpaper's colour;
// the PC uses the one picked here (saved in _system/settings.md and built into the pages).
export function LookSettings() {
  const app = useIsApp();
  const [accent, setAccent] = useState<string | null | undefined>(undefined);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api<{ theme?: { accent: string | null } }>("settings").then((s) => s.theme && setAccent(s.theme.accent), () => undefined);
  }, []);
  if (accent === undefined) return null;

  async function save(value: string | null) {
    try {
      await api("settings", { method: "PUT", body: { theme: { accent: value } } });
      if (!app) applyAccent(value);
      setAccent(value);
      feel("saved");
      setMsg(value ? "Saved." : "Back to the default colour.");
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="card flex flex-col gap-4 p-5 text-sm">
      <h2 className="font-serif text-xl text-ink">Look</h2>
      <p className="text-ink-dim">
        {app
          ? "On the phone, LifeOS takes its accent colour from your wallpaper, like the rest of the phone. The colour below is for the PC."
          : "Light or dark follows Windows. Pick the accent colour; the phone app uses its wallpaper's colour instead."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span>Accent</span>
          <input type="color" value={accent ?? "#3d7cf4"} onChange={(e) => setAccent(e.target.value)} className="h-9 w-14 cursor-pointer rounded-md bg-transparent" />
        </label>
        <button type="button" className="chip edit-primary" onClick={() => void save(accent ?? "#3d7cf4")}>
          Save
        </button>
        <button type="button" className="chip" onClick={() => void save(null)}>
          Default
        </button>
        {msg && <span className="text-ink-dim">{msg}</span>}
      </div>
    </div>
  );
}
