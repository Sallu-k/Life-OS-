import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { TodayApp } from "@/components/today/TodayApp";
import { gameSnapshot } from "@/lib/vault/gameData";
import { loadSettings } from "@/lib/vault/settings";

export const metadata: Metadata = { title: "Today" };

// The daily screen. Everything on it is loaded live from the LifeOS server, so the static site holds
// no journal text and no task list.
export default function TodayPage() {
  return (
    <main data-theme="home" className="mx-auto w-full max-w-6xl px-5 pb-16 pt-6 sm:px-8 sm:pb-24 sm:pt-14">
      <PageHeader eyebrow="Daily" title="Today" stats={["Habits, tasks and the day's notes"]} />
      <TodayApp game={loadSettings().game} snapshot={gameSnapshot()} />
    </main>
  );
}
