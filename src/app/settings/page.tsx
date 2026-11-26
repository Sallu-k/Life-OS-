import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { SettingsPanel } from "@/components/edit/SettingsPanel";
import { FeelSettings } from "@/components/feel/FeelSettings";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-5 pb-16 pt-6 sm:px-8 sm:pb-24 sm:pt-14">
      <PageHeader eyebrow="LifeOS" title="Settings" stats={["Editing, connection, sound and feel"]} />
      <div className="flex flex-col gap-6">
        <SettingsPanel />
        <FeelSettings />
      </div>
    </main>
  );
}
