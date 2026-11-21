"use client";

import { useEffect, useState } from "react";
import { api, useIsApp } from "@/lib/api";
import { gateEnable, gateStatus, openGateNotification, openGateSettings, type GateStatus } from "@/lib/device";
import { feel } from "@/lib/feel/sounds";

interface Gate {
  phone: boolean;
  pc: boolean;
  grace: number;
  minutes: number[];
  fun: { kind: string; label: string; app: string }[];
  watch: string[];
  dual?: string[];
  night?: { from: string | null; until: string; grey?: number }; // night lock (scripts/lib/settings.mjs)
  cap?: number; // leisure minutes a day with no waiting on the Gates
}

// "Comics: com.brave.browser" per line <-> { kind: "comics", label: "Comics", app: "com.brave.browser" }
const funToText = (fun: Gate["fun"]) => fun.map((f) => (f.app ? `${f.label}: ${f.app}` : f.label)).join("\n");
const textToFun = (text: string) =>
  text
    .split("\n")
    .map((line) => line.split(":").map((s) => s.trim()))
    .filter(([label]) => label)
    .map(([label, app]) => ({ kind: label.toLowerCase().replace(/[^a-z]/g, "").slice(0, 20) || "fun", label, app: app ?? "" }));

// The Gate: the "why now?" chooser on every phone unlock and PC sign-in/unlock. Saved in _system/settings.md.
export function GateSettings() {
  const app = useIsApp();
  const [gate, setGate] = useState<Gate | null>(null);
  const [fun, setFun] = useState("");
  const [watch, setWatch] = useState("");
  const [dual, setDual] = useState("");
  const [status, setStatus] = useState<GateStatus | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api<{ gate?: Gate }>("settings").then((s) => {
      if (!s.gate) return; // a PC server from before the Gate
      setGate(s.gate);
      setFun(funToText(s.gate.fun));
      setWatch(s.gate.watch.join("\n"));
      setDual((s.gate.dual ?? []).join("\n"));
    }, () => undefined);
  }, []);
  useEffect(() => {
    if (!app) return;
    const check = () => void gateStatus().then(setStatus);
    check();
    document.addEventListener("visibilitychange", check); // re-check after coming back from Android settings
    return () => document.removeEventListener("visibilitychange", check);
  }, [app]);
  if (!gate) return null;

  async function save() {
    if (!gate) return;
    const body = { ...gate, fun: textToFun(fun), watch: watch.split(/\s+/).filter(Boolean), dual: dual.split(/\s+/).filter(Boolean) };
    try {
      const s = await api<{ gate: Gate }>("settings", { method: "PUT", body: { gate: body } });
      setGate(s.gate);
      setFun(funToText(s.gate.fun));
      setWatch(s.gate.watch.join("\n"));
      setDual((s.gate.dual ?? []).join("\n"));
      feel("saved");
      setMsg("Saved. The phone picks it up after its next Gate.");
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  const check = (key: "phone" | "pc", label: string) => (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={gate[key]} onChange={(e) => setGate({ ...gate, [key]: e.target.checked })} />
      <span>{label}</span>
    </label>
  );

  return (
    <div className="card flex flex-col gap-4 p-5 text-sm">
      <h2 className="font-serif text-xl text-ink">The Gate</h2>
      <p className="text-ink-dim">
        After every unlock, choose why: Unlock (urgent, one slide), Fun (one thing to learn first; the session runs out and asks again, each "more" a little longer), Note or Task. No waiting until the day&rsquo;s leisure passes the limit below; after it, the breathing pauses come back. Each choice is logged, never the text.
      </p>
      {app && status && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={status.enabled} onChange={(e) => void gateEnable(e.target.checked).then((s) => s && setStatus(s))} />
            <span className="text-ink">Gate on this phone</span>
          </label>
          {status.enabled && !status.on && (
            <>
              <p className="text-ink-dim">
                One step left: allow LifeOS {!status.overlay ? <b className="text-ink">&ldquo;Display over other apps&rdquo;</b> : <b className="text-ink">Usage access</b>} in the screen that opens, then come back.
              </p>
              <button type="button" className="chip w-fit" onClick={() => void openGateSettings()}>
                Allow it
              </button>
            </>
          )}
          {status.on && (
            <p className="text-ink-dim">
              The Gate is on. It is a small always-on service, not Accessibility, so Google Pay and bank apps keep working. On OnePlus set App info › LifeOS › Battery to Unrestricted so the phone never stops it.
            </p>
          )}
          {status.on && (
            <button type="button" className="chip w-fit" onClick={() => void openGateNotification()}>
              Hide the &ldquo;Gate is on&rdquo; notification
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-4">
        {check("phone", "Gate on the phone")}
        {check("pc", "Gate on the PC")}
      </div>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={Boolean(gate.night?.from)} onChange={(e) => setGate({ ...gate, night: { from: e.target.checked ? "22:30" : null, until: gate.night?.until ?? "05:00" } })} />
          <span className="text-ink">Night lock</span>
        </label>
        {gate.night?.from && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="edit-field">
              <span>From</span>
              <input className="today-input w-32" type="time" value={gate.night.from} onChange={(e) => e.target.value && setGate({ ...gate, night: { ...gate.night!, from: e.target.value } })} />
            </label>
            <label className="edit-field">
              <span>Until</span>
              <input className="today-input w-32" type="time" value={gate.night.until} onChange={(e) => e.target.value && setGate({ ...gate, night: { ...gate.night!, until: e.target.value } })} />
            </label>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" checked={(gate.night.grey ?? 30) > 0} onChange={(e) => setGate({ ...gate, night: { ...gate.night!, grey: e.target.checked ? 30 : 0 } })} />
              <span className="text-ink">Grey PC screen before the night lock</span>
            </label>
            {(gate.night.grey ?? 30) > 0 && (
              <label className="edit-field">
                <span>Grey PC screen, minutes before</span>
                <input className="today-input w-28" type="number" min={1} max={180} value={gate.night.grey ?? 30} onChange={(e) => setGate({ ...gate, night: { ...gate.night!, grey: Math.max(1, Number(e.target.value) || 1) } })} />
              </label>
            )}
          </div>
        )}
        <p className="text-ink-dim">At night the Gate offers only Sleep, a note for tomorrow, or Urgent (say what, wait a minute, then 15 minutes). No leisure, and leisure timers end when it starts.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="edit-field">
          <span>Phone: no Gate again within (minutes)</span>
          <input className="today-input w-28" type="number" min={0} max={30} value={gate.grace} onChange={(e) => setGate({ ...gate, grace: Number(e.target.value) || 0 })} />
        </label>
        <label className="edit-field">
          <span>Leisure a day with no waiting (minutes, phone and PC together)</span>
          <input className="today-input w-28" type="number" min={30} max={720} step={15} value={gate.cap ?? 180} onChange={(e) => setGate({ ...gate, cap: Number(e.target.value) || 180 })} />
        </label>
        <label className="edit-field">
          <span>Fun lengths (minutes)</span>
          <input
            className="today-input"
            value={gate.minutes.join(", ")}
            onChange={(e) => setGate({ ...gate, minutes: e.target.value.split(/[ ,]+/).map(Number).filter((n) => n > 0) })}
          />
        </label>
      </div>
      <label className="edit-field">
        <span>Kinds of fun, one per line (Name: app to open on the phone, optional)</span>
        <textarea className="today-input" rows={4} value={fun} onChange={(e) => setFun(e.target.value)} />
      </label>
      <label className="edit-field">
        <span>Phone apps that bring the Gate back when opened without Fun (one per line)</span>
        <textarea className="today-input" rows={3} value={watch} onChange={(e) => setWatch(e.target.value)} placeholder="com.google.android.youtube" />
      </label>
      <label className="edit-field">
        <span>Apps for both work and fun (Purpose lets them through for 10 min, then asks again)</span>
        <textarea className="today-input" rows={2} value={dual} onChange={(e) => setDual(e.target.value)} placeholder="com.brave.browser" />
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
