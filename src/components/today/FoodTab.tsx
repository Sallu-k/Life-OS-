"use client";

import { useEffect, useState } from "react";
import { feel } from "@/lib/feel/sounds";
import { keepCopy, keptCopy, readKept, saveOrQueue } from "@/lib/offline";
import { searchFoods } from "@/lib/foodSearch";
import { MEALS, mealNow, targets, totals, type Eaten, type Food, type NutritionSettings } from "@/lib/nutrition";
import { Fold } from "./Fold";
import { reactSaved } from "./reactions";
import type { Day } from "./types";

const MEAL_LABEL: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", snacks: "Snacks", dinner: "Dinner" };
const USED = "lifeos-food-used"; // how often each food was added on this device (the quick picks)

function readUsed(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(USED) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}
function countUse(id: string) {
  try {
    const used = readUsed();
    used[id] = (used[id] ?? 0) + 1;
    localStorage.setItem(USED, JSON.stringify(used));
  } catch {
    // not remembered: the quick picks just stay as they were
  }
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);

// Today's Food tab (Build 26): pick what you ate from the food list, with portions, and see the day's protein
// and calories against your targets. The list is in the vault (_system/foods.md); "My foods" fixes it.
// The day's log is private like the journal: shown live only. Works offline like the rest of Today.
export function FoodTab({ day, readOnly, onSave }: { day: Day | null; readOnly: boolean; onSave(c: Partial<Day>): void }) {
  const [foods, setFoods] = useState<Food[]>(() => keptCopy<Food[]>("foods") ?? []);
  const [nutrition, setNutrition] = useState<NutritionSettings | null>(() => keptCopy<{ nutrition?: NutritionSettings }>("settings")?.nutrition ?? null);
  useEffect(() => {
    readKept<Food[]>("foods").then(({ data }) => data && setFoods(data), () => undefined);
    readKept<{ nutrition?: NutritionSettings }>("settings").then(({ data }) => data?.nutrition && setNutrition(data.nutrition), () => undefined);
  }, []);
  const [meal, setMeal] = useState(() => mealNow(new Date().getHours()));
  const [query, setQuery] = useState("");
  const [used, setUsed] = useState<Record<string, number>>({});
  useEffect(() => setUsed(readUsed()), []);

  if (!day) return <p className="text-sm text-ink-dim">Loading…</p>;
  if (day.future) return <p className="card p-5 text-sm text-ink-dim">This day has not come yet.</p>;

  const eaten: Eaten[] = day.food ?? [];
  const byId = new Map(foods.map((f) => [f.id, f]));
  const sum = totals(eaten, foods);
  const goal = targets(nutrition);
  const save = (food: Eaten[]) => onSave({ food });

  function add(f: Food) {
    if (readOnly) return;
    const i = eaten.findIndex((e) => e.meal === meal && e.id === f.id);
    save(i >= 0 ? eaten.map((e, j) => (j === i ? { ...e, qty: Math.min(20, e.qty + 1) } : e)) : [...eaten, { meal, id: f.id, qty: 1 }]);
    countUse(f.id);
    setUsed(readUsed());
    setQuery("");
    feel("select");
  }
  function step(i: number, delta: number) {
    if (readOnly) return;
    const qty = eaten[i].qty + delta;
    save(qty < 0.5 ? eaten.filter((_, j) => j !== i) : eaten.map((e, j) => (j === i ? { ...e, qty: Math.min(20, qty) } : e)));
  }

  const found = searchFoods(foods, query, used);
  const quick = Object.entries(used)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => byId.get(id))
    .filter((f): f is Food => Boolean(f))
    .slice(0, 10);

  return (
    <div className="flex flex-col gap-5">
      <section className="card flex flex-col gap-4 p-4 sm:p-5" aria-label="Today's totals">
        <Bar label="Protein" value={sum.protein} goal={goal.protein} unit="g" />
        <Bar label="Calories" value={sum.kcal} goal={goal.kcal} unit="kcal" />
        <p className="text-xs text-ink-dim">
          Values are estimates per home portion.
          {!goal.weightSet && " Targets assume 65 kg: set your weight in Settings › Food."}
        </p>
      </section>

      {!readOnly && (
        <section className="card flex flex-col gap-3 p-4 sm:p-5" aria-label="Add food">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Meal">
            {MEALS.map((m) => (
              <button key={m} type="button" className="chip" aria-pressed={meal === m} onClick={() => setMeal(m)}>
                {MEAL_LABEL[m]}
              </button>
            ))}
          </div>
          <input className="today-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search food: biryani, egg, neer dosa…" aria-label="Search food" />
          {found.length > 0 ? (
            <ul className="flex flex-col divide-y divide-ink-dim/10">
              {found.map((f) => (
                <li key={f.id}>
                  <button type="button" className="flex w-full items-baseline gap-3 py-2 text-left text-sm" onClick={() => add(f)}>
                    <span className="min-w-0 flex-1">
                      <span className="text-ink">{f.name}</span> <span className="text-xs text-ink-dim">{f.portion}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-dim">
                      {fmt(f.protein)} g · {f.kcal} kcal
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : query.trim() ? (
            <p className="text-xs text-ink-dim">Not in the list. Add it under My foods below.</p>
          ) : (
            quick.length > 0 && (
              <div className="flex flex-wrap gap-2" aria-label="Often eaten">
                {quick.map((f) => (
                  <button key={f.id} type="button" className="chip text-xs" onClick={() => add(f)}>
                    + {f.name}
                  </button>
                ))}
              </div>
            )
          )}
        </section>
      )}

      {MEALS.map((m) => {
        const items = eaten.map((e, i) => ({ e, i })).filter(({ e }) => e.meal === m);
        if (!items.length) return null;
        const t = totals(items.map(({ e }) => e), foods);
        return (
          <section key={m} className="card p-4 sm:p-5" aria-label={MEAL_LABEL[m]}>
            <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-ink-dim">
              {MEAL_LABEL[m]}
              <span className="ml-auto text-xs font-normal">
                {t.protein} g · {t.kcal} kcal
              </span>
            </h2>
            <ul className="flex flex-col divide-y divide-ink-dim/10">
              {items.map(({ e, i }) => {
                const f = byId.get(e.id);
                return (
                  <li key={`${e.id}-${i}`} className="flex items-center gap-2 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="text-ink">{f?.name ?? e.id}</span>
                      <span className="block text-xs text-ink-dim">
                        {f ? `${f.portion} · ${fmt(f.protein * e.qty)} g protein` : "not in the food list"}
                      </span>
                    </span>
                    {!readOnly && (
                      <button type="button" className="chip" onClick={() => step(i, -0.5)} aria-label={`Less ${f?.name ?? e.id}`}>
                        −
                      </button>
                    )}
                    <span className="w-8 text-center tabular-nums">×{fmt(e.qty)}</span>
                    {!readOnly && (
                      <button type="button" className="chip" onClick={() => step(i, 0.5)} aria-label={`More ${f?.name ?? e.id}`}>
                        +
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {eaten.length === 0 && <p className="text-sm text-ink-dim">Nothing logged {readOnly ? "this day" : "yet: search above and tap what you ate"}.</p>}

      <MyFoods foods={foods} onSaved={setFoods} />
    </div>
  );
}

function Bar({ label, value, goal, unit }: { label: string; value: number; goal: number; unit: string }) {
  const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  const left = goal - value;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-baseline gap-2 text-sm">
        <span className="font-semibold text-ink">{label}</span>
        <span className="tabular-nums text-ink">
          {value} / {goal} {unit}
        </span>
        <span className="ml-auto text-xs text-ink-dim">{left > 0 ? `${left} ${unit} to go` : "Target reached"}</span>
      </p>
      <span className="progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} ${pct}% of target`}>
        <span className="progress-fill" style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "food";
const blank = { id: "", name: "", group: "Other", portion: "1 portion", kcal: 0, protein: 0 };

// Fix a food's portion or values, or add a food that is missing. Ids stay as they are (day notes use them).
function MyFoods({ foods, onSaved }: { foods: Food[]; onSaved(list: Food[]): void }) {
  const [form, setForm] = useState<Food>(blank);
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState("");
  const groups = [...new Set(foods.map((f) => f.group))];
  const found = searchFoods(foods, query);

  async function save(e: React.MouseEvent<HTMLButtonElement>) {
    const name = form.name.trim();
    if (!name) return setMsg("Give it a name.");
    // Saving replaces the whole list: never before the list has been loaded once (it would wipe it).
    if (!foods.length) return setMsg("The food list has not loaded yet. Connect to the PC once, then try again.");
    let list: Food[];
    if (form.id) list = foods.map((f) => (f.id === form.id ? { ...form, name } : f));
    else {
      let id = slug(name);
      for (let n = 2; foods.some((f) => f.id === id); n++) id = `${slug(name)}-${n}`;
      list = [...foods, { ...form, id, name }];
    }
    try {
      const r = await saveOrQueue<Food[]>("foods", { foods: list });
      const next = r.data ?? list;
      onSaved(next);
      keepCopy("foods", next);
      setMsg(r.queued ? "Saved on this device; sent when the PC answers." : form.id ? "Food updated." : "Food added.");
      setForm(blank);
      reactSaved(e.currentTarget);
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  const field = (key: "kcal" | "protein", label: string) => (
    <label className="edit-field min-w-0">
      <span>{label}</span>
      <input
        className="today-input w-full min-w-0"
        type="number"
        inputMode="decimal"
        min={0}
        step={key === "protein" ? 0.5 : 10}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: Math.max(0, Number(e.target.value) || 0) })}
      />
    </label>
  );

  return (
    <Fold id="my-foods" title="My foods" summary={`${foods.length} foods · fix values or add one`}>
      <input className="today-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a food to fix" aria-label="Find a food to fix" />
      {found.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {found.map((f) => (
            <button key={f.id} type="button" className="chip text-xs" onClick={() => (setForm(f), setQuery(""), setMsg(""))}>
              {f.name}
            </button>
          ))}
        </div>
      )}
      <p className="text-sm font-semibold text-ink">{form.id ? `Editing: ${form.name || form.id}` : "New food"}</p>
      <label className="edit-field">
        <span>Name</span>
        <input className="today-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Mutton paya" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="edit-field min-w-0">
          <span>One portion is</span>
          <input className="today-input w-full min-w-0" value={form.portion} onChange={(e) => setForm({ ...form, portion: e.target.value })} placeholder="1 plate (~200 g)" />
        </label>
        <label className="edit-field min-w-0">
          <span>Group</span>
          <select className="today-input w-full min-w-0" value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })}>
            {[...new Set([...groups, "Other", form.group])].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        {field("protein", "Protein (g)")}
        {field("kcal", "Calories (kcal)")}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="chip edit-primary" onClick={save} disabled={!form.name.trim()}>
          {form.id ? "Save changes" : "Add food"}
        </button>
        {form.id && (
          <button type="button" className="chip" onClick={() => (setForm(blank), setMsg(""))}>
            Cancel
          </button>
        )}
        {msg && <span className="text-xs text-ink-dim">{msg}</span>}
      </div>
      <p className="text-xs text-ink-dim">Not sure of a value? A food label, or a similar dish in the list, is a good guide. Changes apply to today&apos;s totals at once; past days keep the totals they were saved with.</p>
    </Fold>
  );
}
