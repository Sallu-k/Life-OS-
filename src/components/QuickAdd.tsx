"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, useServer } from "@/lib/api";
import { stamp } from "@/lib/dayRules";
import { feel } from "@/lib/feel/sounds";
import { placeLabel } from "@/lib/plan";
import { quickParse } from "@/lib/quickParse";
import { firstDay, parseRepeat } from "@/lib/repeat";
import { useBackClose } from "@/lib/useBackClose";

// Ctrl+K (or the header button): one box to add things without clicking around.
// Type and press Enter to add a task (when, time, priority… can be typed: "pay fees by fri 10am !high");
// arrow down for Someday, Inbox, a brainstorm idea or a fun item;
// or type a page name to jump there.
const PAGES = [
  ["Today", "/today/"],
  ["Plan", "/plan/"],
  ["Habits", "/habits/"],
  ["Life areas", "/areas/"],
  ["Insights", "/insights/"],
  ["Weekly review", "/review/"],
  ["Library", "/library/"],
  ["Games", "/games/"],
  ["Certificates", "/certificates/"],
  ["Achievements", "/achievements/"],
  ["Home", "/"],
  ["Settings", "/settings/"],
] as const;

type Action = { label: string; hint: string; run(): Promise<string | void> };

const today = () => stamp().slice(0, 10);

export function QuickAdd() {
  const router = useRouter();
  const server = useServer();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pick, setPick] = useState(0);
  const [msg, setMsg] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const leaving = useBackClose(open, () => dialog.current?.close()); // Android's Back closes the box

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("lifeos-quickadd", onOpen);
    return () => (window.removeEventListener("keydown", onKey), window.removeEventListener("lifeos-quickadd", onOpen));
  }, []);
  useEffect(() => {
    if (open) {
      setText("");
      setPick(0);
      setMsg("");
      dialog.current?.showModal();
      feel("open");
    }
  }, [open]);

  const t = text.trim();
  const parsed = quickParse(t, today());
  const taskDate = parsed.date ?? (parsed.repeat ? firstDay(parseRepeat(parsed.repeat), today()) : today());
  const actions: Action[] = [];
  if (t && server) {
    actions.push(
      {
        // Typed details work here too: "pay fees by fri 10am !high", "clean room this week" (lib/quickParse.ts).
        label: `Add task “${parsed.text || t}”`,
        hint: [placeLabel(taskDate, today()), ...parsed.found.filter((f) => !f.startsWith("📅"))].join(" · "),
        run: async () => {
          const { found: _f, date: _d, ...body } = parsed;
          await api("task", { method: "POST", body: { ...body, text: parsed.text || t, date: taskDate } });
          feel("taskAdd");
          return `Task added: ${placeLabel(taskDate, today())}.`;
        },
      },
      { label: `Add “${parsed.text || t}” to Someday`, hint: "no date yet", run: async () => (await api("task", { method: "POST", body: { date: "someday", text: parsed.text || t } }), feel("taskAdd"), "Added to Someday.") },
      ...(/^(money|got|received)\s+[\d.,]+/i.test(t)
        ? [
            {
              // "money 2000 scholarship": money that came in (the weekly review page shows it).
              label: `Money in: ${t.replace(/^(money|got|received)\s+/i, "")}`,
              hint: "money in this month",
              run: async () => {
                const m = /^(?:money|got|received)\s+([\d.,]+)\s*(.*)$/i.exec(t)!;
                await api("money/add", { method: "PUT", body: { kind: "in", date: today(), amount: Number(m[1].replace(/,/g, "")), label: m[2] || "Money in" } });
                feel("saved");
                return "Money in added.";
              },
            },
          ]
        : []),
      { label: `Save “${t}” to Inbox`, hint: "a thought for later", run: async () => (await api("capture", { method: "POST", body: { kind: "inbox", text: t } }), feel("saved"), "Saved to Inbox.") },
      { label: `New brainstorm idea “${t}”`, hint: "its own note", run: async () => (await api("capture", { method: "POST", body: { kind: "brainstorm", text: t } }), feel("saved"), "Brainstorm note created.") },
      {
        label: `Add fun “${t}”`,
        hint: "today's fun list",
        run: async () => {
          const day = await api<{ fun: string[] }>(`day/${today()}`);
          await api(`day/${today()}`, { method: "PUT", body: { fun: [...day.fun, `other: ${t}`], at: stamp() } });
          feel("funOther");
          return "Added to today's fun.";
        },
      },
    );
  }
  // "money 2000 …" means money that came in, so that comes first (Enter picks it).
  const moneyAt = actions.findIndex((a) => a.label.startsWith("Money in:"));
  if (moneyAt > 0) actions.unshift(...actions.splice(moneyAt, 1));
  for (const [name, href] of PAGES)
    if (!t || name.toLowerCase().includes(t.toLowerCase()))
      actions.push({ label: `Go to ${name}`, hint: "page", run: async () => (leaving(), router.replace(href), feel("tap"), close()) });

  function close() {
    dialog.current?.close();
    setOpen(false);
  }
  async function run(a: Action | undefined) {
    if (!a) return;
    try {
      const done = await a.run();
      if (done) {
        setMsg(done);
        setText("");
        setTimeout(close, 700);
      }
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  if (!open) return null;
  return (
    <dialog ref={dialog} className="quick-add" onClose={() => setOpen(false)} aria-label="Quick add">
      <input
        autoFocus
        className="quick-add-input"
        value={text}
        placeholder={server ? "Add a task, a thought, fun… or type a page name" : "Type a page name"}
        onChange={(e) => (setText(e.target.value), setPick(0))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), setPick((p) => Math.min(p + 1, actions.length - 1)));
          if (e.key === "ArrowUp") (e.preventDefault(), setPick((p) => Math.max(p - 1, 0)));
          if (e.key === "Enter") (e.preventDefault(), run(actions[pick]));
        }}
      />
      <ul className="quick-add-list" role="listbox">
        {actions.slice(0, 9).map((a, i) => (
          <li key={a.label} role="option" aria-selected={i === pick}>
            <button type="button" onMouseEnter={() => setPick(i)} onClick={() => run(a)}>
              <span>{a.label}</span>
              <span className="text-xs text-ink-dim">{a.hint}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="quick-add-foot">{msg || "Enter to run · ↑↓ to choose · Esc to close"}</p>
    </dialog>
  );
}
