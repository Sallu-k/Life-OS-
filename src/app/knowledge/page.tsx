import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { KnowledgeApp } from "@/components/knowledge/KnowledgeApp";

export const metadata: Metadata = { title: "Knowledge" };

// Cards to read and recall, and whole books read a passage at a time. Loaded live from the LifeOS
// server, so the static site holds no card or passage text.
export default function KnowledgePage() {
  return (
    <main data-theme="home" className="mx-auto w-full max-w-4xl px-5 pb-16 pt-6 sm:px-8 sm:pb-24 sm:pt-14">
      <PageHeader eyebrow="Grow" title="Knowledge" stats={["Read a little, remember it, keep going"]} />
      <KnowledgeApp />
    </main>
  );
}
