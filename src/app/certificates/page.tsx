import type { Metadata } from "next";
import { CertificatesExperience } from "@/components/CertificatesExperience";
import { loadCertStages } from "@/lib/vault/certStagesData";
import { PageHeader } from "@/components/PageHeader";
import { VaultWarnings } from "@/components/VaultWarnings";
import { plural } from "@/lib/format";
import { assetUrl } from "@/lib/vault/assets";
import { SectionTools } from "@/components/edit/EditTools";
import { loadCertificates } from "@/lib/vault/certificates";

export const metadata: Metadata = { title: "Certificates" };

export default function CertificatesPage() {
  const { items, warnings } = loadCertificates();

  const certs = items.map((c) => ({
    slug: c.slug,
    title: c.title,
    issuer: c.issuer,
    date: c.date,
    category: c.category,
    highlight: c.highlight,
    url: assetUrl(c.file),
  }));
  const highlights = certs.filter((c) => c.highlight).length;
  const stats = [plural(certs.length, "certificate"), ...(highlights > 0 ? [plural(highlights, "highlight")] : [])];

  return (
    <main data-theme="gallery" className="mx-auto w-full max-w-6xl px-5 pb-16 pt-6 sm:px-8 sm:pb-24 sm:pt-14">
      <PageHeader eyebrow="Recognition" title="Certificates" stats={stats} />
      <SectionTools collection="certificates" />

      {certs.length === 0 ? (
        <p className="text-ink-dim">No certificates yet. Add a note in Collections/Certificates in your vault.</p>
      ) : (
        <CertificatesExperience certs={certs} stageList={loadCertStages()} />
      )}

      <VaultWarnings warnings={warnings} />
    </main>
  );
}
