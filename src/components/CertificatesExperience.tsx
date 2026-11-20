"use client";

import { useState } from "react";
import { certStages, type Stage } from "@/lib/vault/certStages";
import { CertificateGrid, type CertificateCard } from "./CertificateGrid";
import { CertificateViewer } from "./CertificateViewer";
import { SceneShell, type SceneCallbacks } from "./SceneShell";

// The Certificates page body: a 3D museum hall with a wall per life stage (when this computer can show it),
// or the classic grid. Clicking a wall opens that stage's grid; clicking a framed certificate opens the viewer.
export function CertificatesExperience({ certs, stageList }: { certs: CertificateCard[]; stageList: Stage[] }) {
  const [viewing, setViewing] = useState<CertificateCard | null>(null);
  const stages = certStages(certs, stageList);
  const certsOf = (name: string) => stages.find((s) => s.name === name)?.certs ?? [];

  async function start(callbacks: SceneCallbacks) {
    const { createCertificateGallery } = await import("@/lib/three/certificateGallery");
    return createCertificateGallery({
      ...callbacks,
      stages: stages.map((s) => ({
        name: s.name,
        certs: s.certs.map((c) => ({ slug: c.slug, title: c.title, issuer: c.issuer, date: c.date, url: c.url, highlight: c.highlight })),
      })),
      onOpenCert: (slug) => setViewing(certs.find((c) => c.slug === slug) ?? null),
    });
  }

  return (
    <SceneShell
      storageKey="lifeos-certificates-mode"
      sceneLabel="Gallery"
      label="Certificate gallery: pick a wall"
      hint="Drag to turn the hall · scroll to zoom · click a wall"
      groups={stages.map((s) => s.name)}
      start={start}
      classic={<CertificateGrid certs={certs} />}
      panelTitle={(name) => (
        <>
          {name} <span className="text-sm text-ink-dim">{certsOf(name).length}</span>
        </>
      )}
      panel={(name) => <CertificateGrid key={name} certs={certsOf(name)} />}
      overlay={<CertificateViewer cert={viewing} onClose={() => setViewing(null)} />}
    />
  );
}
