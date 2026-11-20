"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { feel } from "@/lib/feel/sounds";

// How many books to finish this year (shown on the Library's reading panel). Saved in _system/settings.md.
export function ReadingGoal() {
  const [goal, setGoal] = useState<string>("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api<{ reading?: { goalBooks: number | null } }>("settings").then((s) => setGoal(s.reading?.goalBooks ? String(s.reading.goalBooks) : ""), () => undefined);
  }, []);

  async function save() {
    try {
      await api("settings", { method: "PUT", body: { reading: { goalBooks: goal === "" ? null : Number(goal) } } });
      feel("saved");
      setMsg("Saved. The Library updates after the next rebuild (about a minute).");
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="card flex flex-col gap-3 p-5 text-sm">
      <h2 className="font-serif text-xl text-ink">Reading goal</h2>
      <label className="edit-field">
        <span>Books to finish in {new Date().getFullYear()}</span>
        <input className="today-input w-32" type="number" min={1} max={500} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. 24" />
      </label>
      <div className="flex items-center gap-3">
        <button type="button" className="chip edit-primary" onClick={save}>
          Save
        </button>
        {msg && <span className="text-ink-dim">{msg}</span>}
      </div>
    </div>
  );
}
