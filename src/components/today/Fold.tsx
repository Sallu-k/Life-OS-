"use client";

import { useEffect, useState, type ReactNode } from "react";
import { feel } from "@/lib/feel/sounds";

// A Today card that folds to one line (its title and a short summary), so the page shows what matters
// first. Whether it is open is remembered on this device.
export function Fold({ id, title, summary, children, defaultOpen = false }: { id: string; title: string; summary?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const key = `lifeos-fold-${id}`;
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) setOpen(saved === "1");
    } catch {
      // no storage: use the default
    }
  }, [key]);
  const toggle = () => {
    feel(open ? "close" : "open");
    setOpen(!open);
    try {
      localStorage.setItem(key, open ? "0" : "1");
    } catch {
      // no storage: not remembered
    }
  };
  return (
    <section className="card flex flex-col gap-3 p-4 sm:p-5">
      <button type="button" className="fold-head" aria-expanded={open} onClick={toggle}>
        <span className="habit-chevron" aria-hidden="true">
          ›
        </span>
        <h2 className="font-serif text-xl text-ink">{title}</h2>
        {summary && <span className="ml-auto truncate text-xs text-ink-dim">{summary}</span>}
      </button>
      {open && <div className="fold-body flex flex-col gap-3">{children}</div>}
    </section>
  );
}
