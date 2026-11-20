"use client";

import { useState } from "react";
import { api, apiUrl, getToken, useServer } from "@/lib/api";
import { feel } from "@/lib/feel/sounds";
import { EditDrawer } from "./EditDrawer";
import { SCHEMA, type Collection } from "./schema";

// An "Edit" button for one item. Hidden unless the page is served by the local LifeOS server.
export function EditButton({ collection, slug }: { collection: Collection; slug: string }) {
  const server = useServer();
  const [open, setOpen] = useState(false);
  if (!server) return null;
  return (
    <>
      <button type="button" className="chip edit-trigger w-fit self-start" onClick={() => setOpen(true)}>
        ✎ Edit
      </button>
      {open && <EditDrawer collection={collection} slug={slug} onClose={(saved) => (setOpen(false), saved && setTimeout(() => location.reload(), 4000))} />}
    </>
  );
}

// Add / Edit… / Import / Export for a whole section. Hidden unless served by the local LifeOS server.
export function SectionTools({ collection }: { collection: Collection }) {
  const server = useServer();
  const [drawer, setDrawer] = useState<{ slug: string | null } | null>(null);
  const [picking, setPicking] = useState<{ slug: string; title: string }[] | null>(null);
  const [message, setMessage] = useState("");
  if (!server) return null;
  const label = SCHEMA[collection].label.toLowerCase();

  async function pick() {
    const items = await api<{ slug: string; title: string }[]>(collection);
    setPicking(items.sort((a, b) => String(a.title).localeCompare(String(b.title))));
  }

  async function importFile(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      const items = Array.isArray(parsed) ? parsed : parsed.items;
      if (!Array.isArray(items)) throw new Error("The file must hold a list of items");
      const dry = await api<{ created: string[]; updated: string[]; errors: string[] }>(`import/${collection}`, { method: "POST", body: { items, dryRun: true } });
      const ok = confirm(`Import ${file.name}?\n\nNew: ${dry.created.length}\nUpdated: ${dry.updated.length}${dry.errors.length ? `\nProblems: ${dry.errors.length}` : ""}\n\nUpdates only change the fields in the file. Old versions are backed up.`);
      if (!ok) return;
      const done = await api<{ created: string[]; updated: string[]; errors: string[] }>(`import/${collection}`, { method: "POST", body: { items } });
      feel("imported");
      setMessage(`Imported: ${done.created.length} new, ${done.updated.length} updated${done.errors.length ? `, ${done.errors.length} problems: ${done.errors.slice(0, 3).join("; ")}` : ""}. Rebuilding…`);
      setTimeout(() => location.reload(), 6000);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  async function exportFile() {
    const res = await fetch(apiUrl(`export/${collection}`), { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} });
    if (!res.ok) return setMessage("Export failed. Check the token on the Settings page.");
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: `lifeos-${collection}.json` });
    a.click();
    URL.revokeObjectURL(url);
    feel("saved");
  }

  return (
    <div className="edit-tools" role="group" aria-label={`Edit ${collection}`}>
      <button type="button" className="chip edit-primary" onClick={() => setDrawer({ slug: null })}>
        + Add {label}
      </button>
      <button type="button" className="chip" onClick={pick}>
        ✎ Edit {/^[aeiou]/.test(label) ? "an" : "a"} {label}…
      </button>
      <label className="chip cursor-pointer">
        Import JSON
        <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
      </label>
      <button type="button" className="chip" onClick={exportFile}>
        Export JSON
      </button>
      {message && <span className="text-xs text-ink-dim">{message}</span>}

      {picking && (
        <select
          autoFocus
          className="edit-picker"
          defaultValue=""
          onChange={(e) => {
            setPicking(null);
            if (e.target.value) setDrawer({ slug: e.target.value });
          }}
          onBlur={() => setPicking(null)}
        >
          <option value="">Choose {/^[aeiou]/.test(label) ? "an" : "a"} {label}…</option>
          {picking.map((i) => (
            <option key={i.slug} value={i.slug}>
              {i.title}
            </option>
          ))}
        </select>
      )}
      {drawer && <EditDrawer collection={collection} slug={drawer.slug} onClose={(saved) => (setDrawer(null), saved && setTimeout(() => location.reload(), 4000))} />}
    </div>
  );
}
