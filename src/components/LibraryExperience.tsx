"use client";

import { useRouter } from "next/navigation";
import { UNSORTED_SHELF } from "@/lib/format";
import { assetUrl } from "@/lib/vault/assets";
import type { Book } from "@/lib/vault/types";
import { LibraryWall } from "./LibraryWall";
import { SceneShell, type SceneCallbacks } from "./SceneShell";

const shelfOf = (b: Book) => b.category ?? UNSORTED_SHELF;

// The Library page body: a 3D hall of shelves (when this computer can show it) or the classic cover wall.
// Clicking a shelf in the hall opens the same cover wall, limited to that shelf.
export function LibraryExperience({ books, shelves }: { books: Book[]; shelves: string[] }) {
  const router = useRouter();

  async function start(callbacks: SceneCallbacks) {
    const { createLibraryHall } = await import("@/lib/three/libraryHall");
    return createLibraryHall({
      ...callbacks,
      shelves,
      books: books.map((b) => ({ slug: b.slug, title: b.title, author: b.author, shelf: shelfOf(b), cover: assetUrl(b.cover) })),
      onOpenBook: (slug) => router.push(`/books/${slug}/`),
    });
  }

  return (
    <SceneShell
      storageKey="lifeos-library-mode"
      sceneLabel="Hall"
      label="Library hall: pick a shelf"
      hint="Drag to turn the room · scroll to zoom · click a shelf"
      groups={shelves}
      start={start}
      classic={<LibraryWall books={books} shelves={shelves} />}
      panelTitle={(shelf) => (
        <>
          {shelf} <span className="text-sm text-ink-dim">{books.filter((b) => shelfOf(b) === shelf).length}</span>
        </>
      )}
      panel={(shelf) => <LibraryWall key={shelf} books={books.filter((b) => shelfOf(b) === shelf)} shelves={[shelf]} />}
    />
  );
}
