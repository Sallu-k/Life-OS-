"use client";

import { useEffect, useRef } from "react";
import { dayLabel } from "@/lib/format";
import type { CertificateCard } from "./CertificateGrid";

// A native <dialog>: Esc, the Close button and a click outside all close it; focus returns to the page.
export function CertificateViewer({ cert, onClose }: { cert: CertificateCard | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (cert && !dialog.open) dialog.showModal();
    if (!cert && dialog.open) dialog.close();
  }, [cert]);

  // A click on the dialog element itself (not its content) is a click on the dark backdrop.
  function onBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget) ref.current?.close();
  }

  const isPdf = cert?.url?.toLowerCase().endsWith(".pdf") ?? false;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={onBackdropClick}
      aria-labelledby="cert-title"
      className="viewer m-auto w-[min(56rem,calc(100vw-2rem))] rounded-xl border border-ink-dim/25 bg-surface p-0 text-ink shadow-2xl"
    >
      {cert && (
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="cert-title" className="font-serif text-2xl">{cert.title}</h2>
              <p className="text-sm text-ink-dim">
                {cert.issuer} · {dayLabel(cert.date)}
              </p>
            </div>
            <button type="button" onClick={() => ref.current?.close()} className="chip shrink-0">
              Close
            </button>
          </div>
          {!cert.url ? (
            <div className="cover-placeholder aspect-[4/3] items-center justify-center rounded-lg bg-surface-hi text-sm text-ink-dim">
              <span className="relative z-10">No file attached yet</span>
            </div>
          ) : isPdf ? (
            <iframe src={cert.url} title={`Certificate: ${cert.title}`} className="h-[70vh] w-full rounded-lg bg-surface-hi" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cert.url} alt={`Certificate: ${cert.title}`} className="max-h-[70vh] w-full rounded-lg object-contain" />
          )}
          {cert.url && (
            <a href={cert.url} target="_blank" rel="noreferrer" className="w-fit text-sm text-ink-dim underline-offset-4 hover:text-ink hover:underline">
              Open the file in a new tab
            </a>
          )}
        </div>
      )}
    </dialog>
  );
}
