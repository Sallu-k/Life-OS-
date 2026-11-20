"use client";

import { useEffect, useRef, useState } from "react";
import { useBackClose } from "@/lib/useBackClose";
import { api, readImage } from "@/lib/api";
import { feel, feelStar } from "@/lib/feel/sounds";
import { replay, sparkle } from "@/lib/feel/motion";
import { assetUrl } from "@/lib/vault/assets";
import { SCHEMA, type Collection, type Field } from "./schema";

type Item = Record<string, unknown> & { slug?: string };

// A side panel to edit one item (slug given) or add a new one (slug null). Saves to the vault through the
// local LifeOS server; the site then rebuilds itself in the background.
export function EditDrawer({ collection, slug, onClose }: { collection: Collection; slug: string | null; onClose(saved?: boolean): void }) {
  const schema = SCHEMA[collection];
  const [item, setItem] = useState<Item | null>(slug ? null : {});
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useBackClose(true, () => dialog.current?.close()); // Android's Back closes this first
  const saveButton = useRef<HTMLButtonElement>(null);
  const startStatus = useRef<unknown>(null);

  useEffect(() => {
    dialog.current?.showModal();
    feel("open");
    if (slug)
      api<Item>(`${collection}/${slug}`).then(
        (i) => ((startStatus.current = i.status), setItem(i)),
        (e: Error) => setStatus(e.message),
      );
  }, [collection, slug]);

  const set = (key: string, value: unknown) => setItem((prev) => ({ ...(prev ?? {}), [key]: value }));

  async function save() {
    if (!item) return;
    setBusy(true);
    setStatus("Saving…");
    try {
      const { slug: _s, ...body } = item;
      const payload = { ...body, ...(image ? { image } : {}) };
      if (slug) await api(`${collection}/${slug}`, { method: "PUT", body: payload });
      else await api(collection, { method: "POST", body: payload });
      setStatus("Saved. The site is rebuilding; refresh in a few seconds.");
      // Finishing a book or game is a moment; every other save is a quiet confirm.
      const finished = item.status === "finished" && startStatus.current !== "finished";
      feel(finished ? "finished" : "saved");
      replay(saveButton.current, "feel-saved");
      if (finished) sparkle(saveButton.current, 16, 90);
      setTimeout(() => onClose(true), finished ? 1400 : 900);
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!slug || !confirm(`Move "${String(item?.title ?? slug)}" to the vault's _trash folder?`)) return;
    try {
      await api(`${collection}/${slug}`, { method: "DELETE" });
      feel("remove");
      onClose(true);
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  const current = item?.[schema.image.field];
  const preview = image ?? (typeof current === "string" ? assetUrl(current) : null);

  return (
    <dialog ref={dialog} className="edit-drawer" onClose={() => (feel("close"), onClose())} aria-label={slug ? `Edit ${schema.label}` : `Add ${schema.label}`}>
      <form method="dialog" onSubmit={(e) => (e.preventDefault(), save())} className="flex h-full flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-ink-dim/15 p-4">
          <h2 className="font-serif text-xl text-ink">{slug ? `Edit ${schema.label.toLowerCase()}` : `Add a ${schema.label.toLowerCase()}`}</h2>
          <button type="button" className="chip" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </header>

        {!item ? (
          <p className="p-4 text-sm text-ink-dim">{status || "Loading…"}</p>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-5 flex items-end gap-4">
              <div className="edit-image" style={{ aspectRatio: schema.image.aspect }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {preview ? <img src={preview} alt="" /> : <span>No image</span>}
              </div>
              <label className="chip cursor-pointer">
                {preview ? "Change" : "Add"} {schema.image.label.toLowerCase()}
                <input type="file" accept="image/*" className="sr-only" onChange={async (e) => e.target.files?.[0] && (setImage(await readImage(e.target.files[0])), feel("taskAdd"))} />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {schema.fields.map((f) => (
                <FieldInput key={f.key} field={f} value={item[f.key]} onChange={(v) => set(f.key, v)} />
              ))}
            </div>
          </div>
        )}

        <footer className="flex flex-wrap items-center gap-3 border-t border-ink-dim/15 p-4">
          <button ref={saveButton} type="submit" className="chip edit-primary" disabled={busy || !item}>
            Save
          </button>
          {slug && (
            <button type="button" className="chip" onClick={remove}>
              Move to trash
            </button>
          )}
          <span className="text-sm text-ink-dim" role="status">
            {status}
          </span>
        </footer>
      </form>
    </dialog>
  );
}

function FieldInput({ field, value, onChange }: { field: Field; value: unknown; onChange(v: unknown): void }) {
  const { input } = field;
  const wide = input.kind === "section" || (input.kind === "text" && field.key === "title");
  const str = value === null || value === undefined ? "" : String(value);
  let control: React.ReactNode;
  switch (input.kind) {
    case "section":
      control = <textarea rows={4} value={str} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "number":
      control = <input type="number" min={input.min} max={input.max} step={input.step ?? 1} value={str} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
      break;
    case "date":
      control = <input type="date" value={str} onChange={(e) => onChange(e.target.value || null)} />;
      break;
    case "month":
      control = <input type="month" value={str.slice(0, 7)} onChange={(e) => onChange(e.target.value || null)} />;
      break;
    case "bool":
      control = <input type="checkbox" checked={value === true} onChange={(e) => (feel("toggle"), onChange(e.target.checked))} className="h-5 w-5" />;
      break;
    case "select":
      control = (
        <select value={str} onChange={(e) => (feel(e.target.value === "finished" ? "markDone" : "select"), onChange(e.target.value || null))}>
          {input.options.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      );
      break;
    case "rating":
      control = (
        <span className="flex gap-1" role="radiogroup" aria-label={field.label}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={Number(value) === n} className={`edit-star ${Number(value) >= n ? "on" : ""}`} onClick={(e) => (Number(value) === n ? feel("unmark") : feelStar(n), replay(e.currentTarget, "feel-pop"), onChange(Number(value) === n ? null : n))}>
              ★
            </button>
          ))}
        </span>
      );
      break;
    case "list":
      control = <input type="text" value={Array.isArray(value) ? value.join(", ") : str} onChange={(e) => onChange(e.target.value)} />;
      break;
    default:
      control = <input type="text" value={str} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <label className={`edit-field ${wide ? "sm:col-span-2" : ""}`}>
      <span>
        {field.label}
        {field.hint && <em> · {field.hint}</em>}
      </span>
      {control}
    </label>
  );
}
