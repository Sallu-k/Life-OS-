import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { WeeklyReview } from "@/components/review/WeeklyReview";
import { Money } from "@/components/review/Money";

export const metadata: Metadata = { title: "Weekly review" };

// The weekly review page, with the weekly money check. Everything on it comes live from the LifeOS server
// (the answers and the amounts are private).
export default function ReviewPage() {
  return (
    <main data-theme="home" className="mx-auto w-full max-w-3xl px-5 pb-16 pt-6 sm:px-8 sm:pb-24 sm:pt-14">
      <PageHeader eyebrow="Look back" title="Weekly review" stats={["Five minutes, once a week"]} />
      <WeeklyReview />
      <div id="money" className="mt-8 scroll-mt-24">
        <Money />
      </div>
    </main>
  );
}
