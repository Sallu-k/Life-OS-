"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { feel } from "@/lib/feel/sounds";

interface Sleep {
  by: string;
  habit: string | null;
  windDown: string | null;
}
interface Rewards {
  label: string;
  night: number;
  earn: Record<string, number>;
  cap: number;
}

// Bedtime and rewards: the bedtime target (the phone app ticks the bedtime habit from when its screen went
// off for the night), a wind-down habit reminded an hour before, and the reward time habits earn.
// Saved in _system/settings.md.
export function RewardSettings() {
  const [sleep, setSleep] = useState<Sleep | null>(null);
  const [rewards, setRewards] = useState<Rewards | null>(null);
  const [habits, setHabits] = useState<{ id: string; label: string }[]>([]);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api<{ sleep: Sleep; rewards: Rewards }>("settings").then((s) => (setSleep(s.sleep), setRewards(s.rewards)), () => undefined);
    api<{ id: string; label: string; active?: boolean }[]>("habits").then((h) => setHabits(h.filter((x) => x.active !== false)), () => undefined);
  }, []);
  if (!sleep || !rewards) return null;

  async function save() {
    try {
      await api("settings", { method: "PUT", body: { sleep, rewards } });
      feel("saved");
      setMsg("Saved.");
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  const pick = (value: string | null, onChange: (v: string | null) => void, label: string) => (
    <label className="edit-field">
      <span>{label}</span>
      <select className="today-input" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">None</option>
        {habits.map((h) => (
          <option key={h.id} value={h.id}>
            {h.label}
          </option>
        ))}
      </select>
    </label>
  );
  const earn = (id: string, minutes: number) => {
    const next = { ...rewards.earn };
    if (minutes > 0) next[id] = minutes;
    else delete next[id];
    setRewards({ ...rewards, earn: next });
  };

  return (
    <div className="card flex flex-col gap-4 p-5 text-sm">
      <h2 className="font-serif text-xl text-ink">Bedtime and rewards</h2>
      <p className="text-ink-dim">
        With the phone app, bedtime is measured from when the screen went off for the night: the bedtime habit is ticked done when in bed by the time below, half within 30 minutes after. The evening reminders count back from it.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="edit-field">
          <span>In bed by</span>
          <input className="today-input" type="time" value={sleep.by} onChange={(e) => setSleep({ ...sleep, by: e.target.value || "23:00" })} />
        </label>
        {pick(sleep.habit, (habit) => setSleep({ ...sleep, habit }), "Bedtime habit")}
        {pick(sleep.windDown, (windDown) => setSleep({ ...sleep, windDown }), "Wind-down habit (an hour before)")}
      </div>
      <p className="text-ink-dim">Reward time: minutes of something you enjoy, earned by habits and early nights. Name it after your reward.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="edit-field">
          <span>Name</span>
          <input className="today-input" value={rewards.label} onChange={(e) => setRewards({ ...rewards, label: e.target.value })} placeholder="Reward time" />
        </label>
        <label className="edit-field">
          <span>Early night earns (min)</span>
          <input className="today-input" type="number" min={0} max={240} step={5} value={rewards.night} onChange={(e) => setRewards({ ...rewards, night: Number(e.target.value) || 0 })} />
        </label>
        <label className="edit-field">
          <span>Bank up to (min)</span>
          <input className="today-input" type="number" min={0} max={3000} step={30} value={rewards.cap} onChange={(e) => setRewards({ ...rewards, cap: Number(e.target.value) || 0 })} />
        </label>
      </div>
      <ul className="flex flex-col gap-2">
        {habits.map((h) => (
          <li key={h.id} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-ink">{h.label}</span>
            <input className="today-input w-24" type="number" min={0} max={240} step={5} value={rewards.earn[h.id] ?? 0} onChange={(e) => earn(h.id, Number(e.target.value) || 0)} aria-label={`Minutes earned by ${h.label}`} />
            <span className="text-xs text-ink-dim">min when done</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <button type="button" className="chip edit-primary" onClick={save}>
          Save
        </button>
        {msg && <span className="text-ink-dim">{msg}</span>}
      </div>
    </div>
  );
}
