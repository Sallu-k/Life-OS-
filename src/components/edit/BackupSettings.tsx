"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { feel } from "@/lib/feel/sounds";

interface Status {
  dir: string;
  last: string | null;
  lastSize: number | null;
  error: string | null;
  count: number;
}

// The weekly vault backup (PC only): when it last ran, where the zips go, and a "Back up now" button.
export function BackupSettings() {
  const [s, setS] = useState<Status | null>(null);
  const [dir, setDir] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api<Status>("backup").then((x) => (setS(x), setDir(x.dir)), () => undefined);
  }, []);
  if (!s) return null;

  async function now() {
    setBusy(true);
    setMsg("Backing up…");
    try {
      const x = await api<Status>("backup", { method: "POST", timeout: 120_000 });
      setS(x);
      setMsg(x.error ? `Failed: ${x.error}` : "Backed up.");
      if (!x.error) feel("saved");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveDir() {
    try {
      const x = await api<Status>("backup", { method: "PUT", body: { dir } });
      setS(x);
      setDir(x.dir);
      feel("saved");
      setMsg("Folder saved.");
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  const when = s.last ? new Date(s.last).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <div className="card flex flex-col gap-3 p-5 text-sm">
      <h2 className="font-serif text-xl text-ink">Vault backup</h2>
      <p className="text-ink-dim">
        Every week the whole vault is zipped into the folder below (the last 8 are kept).{" "}
        {when ? `Last backup: ${when}${s.lastSize ? ` (${(s.lastSize / 1e6).toFixed(1)} MB)` : ""} · ${s.count} kept.` : "No backup yet: the first one runs within a minute of LifeOS starting."}
      </p>
      {s.error && <p className="text-copper">Last attempt failed: {s.error}</p>}
      <label className="edit-field">
        <span>Backup folder (OneDrive keeps a copy off this PC)</span>
        <input className="today-input" value={dir} onChange={(e) => setDir(e.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="chip edit-primary" onClick={now} disabled={busy}>
          Back up now
        </button>
        {dir !== s.dir && (
          <button type="button" className="chip" onClick={saveDir}>
            Save folder
          </button>
        )}
        {msg && <span className="text-ink-dim">{msg}</span>}
      </div>
    </div>
  );
}
