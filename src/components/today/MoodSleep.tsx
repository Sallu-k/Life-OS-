"use client";

import { late, MOODS, whenLabel } from "@/lib/dayRules";
import { feel } from "@/lib/feel/sounds";
import { replay } from "@/lib/feel/motion";
import type { Day } from "./types";

// How the day felt (1-5) and how you slept. Saved in the daily note's frontmatter (mood, sleep_hours,
// woke, bedtime); the phone fills in woke/bedtime/hours by itself from its screen (src/lib/sleep.ts),
// and they can be corrected here. The Insights page looks for what goes with good and bad days.
export function MoodSleep({ day, readOnly, onSave }: { day: Day; readOnly: boolean; onSave(c: Partial<Day>): void }) {
  return (
    <section className="card flex flex-col gap-4 p-4 sm:p-5" aria-labelledby="mood-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="mood-heading" className="font-serif text-xl text-ink">
          How was the day?
        </h2>
        {late(day.date, day.logged.mood) && <span className="text-xs text-ink-dim">filled in later · {whenLabel(day.logged.mood)}</span>}
      </div>
      <div className="mood-row" role="radiogroup" aria-label="Mood">
        {MOODS.map(([value, face, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={day.mood === value}
            aria-label={label}
            title={label}
            disabled={readOnly}
            className="mood-btn"
            onClick={(e) => {
              const next = day.mood === value ? null : value;
              feel(next ? (value >= 4 ? "markDone" : value === 3 ? "markHalf" : "markPartial") : "unmark");
              replay(e.currentTarget, "feel-pop");
              onSave({ mood: next });
            }}
          >
            <span aria-hidden="true">{face}</span>
            <span className="mood-label">{label}</span>
          </button>
        ))}
      </div>
      <label className="edit-field">
        <span>
          Sleep <em className="not-italic opacity-70">hours last night</em>
        </span>
        <input
          key={`${day.date}-sleep-${day.sleep}`}
          type="number"
          inputMode="decimal"
          min={0}
          max={24}
          step={0.25}
          disabled={readOnly}
          className="today-input w-full sm:w-40"
          defaultValue={day.sleep ?? ""}
          onBlur={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            if (v !== day.sleep) (onSave({ sleep: v }), feel("saved"));
          }}
        />
      </label>
      <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
        <TimeField label="Woke this morning" value={day.woke ?? null} disabled={readOnly} onSave={(woke) => onSave({ woke })} />
        <TimeField label="To bed this evening" value={day.bedtime ?? null} disabled={readOnly} onSave={(bedtime) => onSave({ bedtime })} />
      </div>
    </section>
  );
}

function TimeField({ label, value, disabled, onSave }: { label: string; value: string | null; disabled: boolean; onSave(v: string | null): void }) {
  return (
    <label className="edit-field">
      <span>{label}</span>
      <input
        key={value ?? "none"}
        type="time"
        disabled={disabled}
        className="today-input w-full"
        defaultValue={value ?? ""}
        onBlur={(e) => {
          const v = e.target.value || null;
          if (v !== value) (onSave(v), feel("saved"));
        }}
      />
    </label>
  );
}
