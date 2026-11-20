import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { PlanApp } from "@/components/plan/PlanApp";

export const metadata: Metadata = { title: "Plan" };

// Planning ahead: tasks on dates with deadlines, a Someday list, and year/month/week goals.
// Loaded live from the LifeOS server, so the static site holds no task list.
export default function PlanPage() {
  return (
    <main data-theme="home" className="mx-auto w-full max-w-6xl px-5 pb-16 pt-6 sm:px-8 sm:pb-24 sm:pt-14">
      <PageHeader eyebrow="Ahead" title="Plan" stats={["Tasks on dates, deadlines and goals"]} />
      <PlanApp />
    </main>
  );
}
