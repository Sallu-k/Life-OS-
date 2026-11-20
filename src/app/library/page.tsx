import type { Metadata } from "next";
import { LibraryExperience } from "@/components/LibraryExperience";
import { PageHeader } from "@/components/PageHeader";
import { ReadingPanel } from "@/components/ReadingPanel";
import { VaultWarnings } from "@/components/VaultWarnings";
import { plural } from "@/lib/format";
import { loadBooks } from "@/lib/vault/books";
import { loadDaily } from "@/lib/vault/daily";
import { loadHabitDefinitions } from "@/lib/vault/habits";
import { readingStats } from "@/lib/vault/reading";
import { loadSettings } from "@/lib/vault/settings";
import { SectionTools } from "@/components/edit/EditTools";
import { shelfOrder } from "@/lib/vault/shelves";

export const metadata: Metadata = { title: "Library" };

export default function LibraryPage() {
  const { items: books, warnings: bookWarnings } = loadBooks();
  const warnings = [...bookWarnings];
  const shelves = shelfOrder(books, warnings);
  const reading = readingStats(books, loadDaily(loadHabitDefinitions().items).items, loadSettings().goalBooks);

  const count = (s: string) => books.filter((b) => b.status === s).length;
  const stats = [
    plural(books.length, "book"),
    ...(shelves.length > 1 ? [`${shelves.length} shelves`] : []),
    ...(count("finished") > 0 ? [`${count("finished")} finished`] : []),
    ...(count("reading") > 0 ? [`${count("reading")} reading`] : []),
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-16 pt-6 sm:px-8 sm:pb-24 sm:pt-14">
      <PageHeader eyebrow="Collection" title="The Library" stats={stats} />

      <SectionTools collection="books" />
      <ReadingPanel stats={reading} />

      {books.length === 0 ? (
        <p className="text-ink-dim">No books yet. Add a note in Collections/Books in your vault.</p>
      ) : (
        <LibraryExperience books={books} shelves={shelves} />
      )}

      <VaultWarnings warnings={warnings} />
    </main>
  );
}
