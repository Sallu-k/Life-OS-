import Link from "next/link";
import type { Book } from "@/lib/vault/types";
import { Book3D } from "./Book3D";
import { Cover } from "./Cover";
import { Progress } from "./Progress";
import { Rating } from "./Rating";

// `depth` shows the cover as a 3D book instead of a flat cover.
export function BookTile({ book, depth = false }: { book: Book; depth?: boolean }) {
  const cover = (
    <Cover
      path={book.cover}
      title={book.title}
      subtitle={book.author ?? book.category ?? undefined}
      alt={`Cover of ${book.title}`}
      ornament={book.status !== "reading"}
    >
      {book.status === "reading" && <span className="badge badge-live absolute left-2 top-2 z-10">Reading</span>}
      {book.special && (
        <span className="absolute right-2.5 top-2 z-10 text-brass" title="A special copy" aria-label="A special copy">
          ✦
        </span>
      )}
    </Cover>
  );

  return (
    <Link href={`/books/${book.slug}/`} className="tile group flex flex-col gap-3 rounded-md">
      {depth ? <Book3D title={book.title}>{cover}</Book3D> : cover}
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-[0.95rem] leading-snug text-ink">{book.title}</h2>
        {book.author && <p className="text-xs text-ink-dim">{book.author}</p>}
        {book.rating !== null && <Rating value={book.rating} />}
        {book.status === "reading" && book.progress !== null && book.pages ? <Progress value={book.progress / book.pages} label={`p. ${book.progress}/${book.pages}`} small /> : null}
        {book.status === "unread" && <p className="text-[11px] uppercase tracking-widest text-ink-dim">To read</p>}
        {book.note?.startsWith("⚠") && <p className="badge badge-flag w-fit">Flagged</p>}
      </div>
    </Link>
  );
}
