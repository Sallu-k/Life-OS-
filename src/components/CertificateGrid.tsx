"use client";

import { useState } from "react";
import { dayLabel } from "@/lib/format";
import type { CertificateCategory } from "@/lib/vault/types";
import { CertificateViewer } from "./CertificateViewer";
import { Chip } from "./Chip";

// What the server page passes in. `url` is the public file URL, or null.
export interface CertificateCard {
  slug: string;
  title: string;
  issuer: string;
  date: string;
  category: CertificateCategory;
  highlight: boolean;
  url: string | null;
}

const LABELS: Record<CertificateCategory, string> = { academic: "Academic", technical: "Technical", event: "Event", other: "Other" };
const ICONS: Record<CertificateCategory, string> = { academic: "◆", technical: "⚙", event: "✶", other: "●" };

export function CertificateGrid({ certs }: { certs: CertificateCard[] }) {
  const [filter, setFilter] = useState<CertificateCategory | "all">("all");
  const [open, setOpen] = useState<CertificateCard | null>(null);

  const used = (Object.keys(LABELS) as CertificateCategory[]).filter((c) => certs.some((x) => x.category === c));
  const shown = filter === "all" ? certs : certs.filter((c) => c.category === filter);

  return (
    <>
      {used.length > 1 && (
        <div className="mb-8 flex flex-wrap gap-2 border-y border-ink-dim/10 py-4" role="group" aria-label="Filter by category">
          {(["all", ...used] as const).map((c) => (
            <Chip key={c} pressed={filter === c} onClick={() => setFilter(c)}>
              {c === "all" ? "All" : LABELS[c]}
            </Chip>
          ))}
        </div>
      )}

      <ul className="cert-grid grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => (
          <li key={c.slug} className="flex">
            <button
              type="button"
              onClick={() => setOpen(c)}
              aria-haspopup="dialog"
              className={`card tile flex w-full flex-col gap-4 p-5 text-left ${c.highlight ? "border-brass/50" : ""}`}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-xs text-ink-dim">
                  <span className="text-brass" aria-hidden="true">{ICONS[c.category]}</span>
                  {LABELS[c.category]}
                </span>
                {c.highlight && <span className="badge text-brass">Highlight</span>}
              </span>
              <span className="font-serif text-xl leading-snug text-ink">{c.title}</span>
              <span className="mt-auto flex items-end justify-between gap-3 border-t border-ink-dim/10 pt-3 text-sm">
                <span className="text-ink-dim">{c.issuer}</span>
                <time dateTime={c.date} className="shrink-0 text-xs text-ink-dim">
                  {dayLabel(c.date, true)}
                </time>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <CertificateViewer cert={open} onClose={() => setOpen(null)} />
    </>
  );
}
