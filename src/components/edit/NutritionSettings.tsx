"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { feel } from "@/lib/feel/sounds";
import { keepCopy } from "@/lib/offline";
import { targets, type NutritionSettings as Nutrition } from "@/lib/nutrition";

// Food (Build 26): body weight and the daily protein and calorie targets for Today's Food tab. Left empty,
// the targets follow the weight (building muscle: 1.8 g protein and about 36 kcal per kg). Saved in
// _system/settings.md.
export function NutritionSettings() {
  const [n, setN] = useState<Nutrition | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api<{ nutrition: Nutrition }>("settings").then((s) => setN(s.nutrition ?? { weight: null, protein: null, kcal: null }), () => undefined);
  }, []);
  if (!n) return null;

  async function save() {
    try {
      const s = await api<Record<string, unknown>>("settings", { method: "PUT", body: { nutrition: n } });
      keepCopy("settings", s); // the Food tab reads targets from this copy offline
      feel("saved");
      setMsg("Saved.");
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  const auto = targets({ ...n, protein: null, kcal: null });
  const number = (key: keyof Nutrition, label: string, placeholder: string, step: number) => (
    <label className="edit-field">
      <span>{label}</span>
      <input
        className="today-input"
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={n[key] ?? ""}
        placeholder={placeholder}
        onChange={(e) => setN({ ...n, [key]: e.target.value === "" ? null : Number(e.target.value) })}
      />
    </label>
  );

  return (
    <div className="card flex flex-col gap-4 p-5 text-sm">
      <h2 className="font-serif text-xl text-ink">Food</h2>
      <p className="text-ink-dim">Your weight sets the daily targets on Today › Food. Leave a target empty to follow the weight: 1.8 g protein and about 36 kcal per kg, for building muscle.</p>
      <div className="grid grid-cols-3 gap-3">
        {number("weight", "Weight (kg)", "65", 0.5)}
        {number("protein", "Protein (g)", `${auto.protein}`, 5)}
        {number("kcal", "Calories", `${auto.kcal}`, 50)}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className="chip edit-primary" onClick={save}>
          Save
        </button>
        {msg && <span className="text-ink-dim">{msg}</span>}
      </div>
    </div>
  );
}
