import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DetailHero, Fact } from "@/components/DetailHero";
import { Paragraphs, Quotes, Section } from "@/components/Prose";
import { Rating } from "@/components/Rating";
import { dayLabel, monthLabel } from "@/lib/format";
import { loadBooks } from "@/lib/vault/books";
import { EditButton } from "@/components/edit/EditTools";
import { Progress } from "@/components/Progress";
import { getBook, staticSlugs } from "@/lib/vault/find";

type Props = { params: Promise<{ slug: string }> };

const STATUS_LABEL = { unread: "To read", reading: "Reading", finished: "Finished", shelf: null } as const;

export const dynamicParams = false;

export function generateStaticParams() {
  return staticSlugs(loadBooks().items.map((b) => b.slug));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const book = getBook((await params).slug);
  return { title: book ? book.title : "Not found" };
}

export default async function BookPage({ params }: Props) {
  const book = getBook((await params).slug);
  if (!book) notFound();
  // "Finished" only makes sense for a finished book, even if the note has a date.
  const month = book.status === "finished" ? monthLabel(book.finished) : null;
  const hasNotes = book.verdict || book.quotes || book.copyStory;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-14 px-5 pb-24 pt-8 sm:px-8 sm:pt-10">
      <DetailHero
        back={{ href: "/library/", label: "Library" }}
        cover={{ path: book.cover, title: book.title, subtitle: book.author ?? book.category ?? "", alt: `Cover of ${book.title}` }}
      >
        {STATUS_LABEL[book.status] && (
          <p className={`badge w-fit ${book.status === "reading" ? "badge-live" : ""}`}>{STATUS_LABEL[book.status]}</p>
        )}
        <h1 className="font-serif text-4xl leading-tight text-ink [overflow-wrap:anywhere] sm:text-5xl">{book.title}</h1>
        {book.author && <p className="text-lg text-ink-dim">by {book.author}</p>}
        {book.opinion && <p className="font-serif text-lg italic text-ink">&ldquo;{book.opinion}&rdquo;</p>}
        {book.status === "reading" && book.progress !== null && (
          <Progress value={book.pages ? book.progress / book.pages : null} label={book.pages ? `Page ${book.progress} of ${book.pages}` : `Page ${book.progress}`} />
        )}
        {book.note?.startsWith("⚠") ? (
          <p className="badge badge-flag w-fit normal-case tracking-normal">{book.note}</p>
        ) : (
          book.note && <p className="text-sm italic text-ink-dim">{book.note}</p>
        )}
        <dl className="mt-1 flex flex-wrap gap-3">
          {book.rating !== null && (
            <Fact label="Rating">
              <Rating value={book.rating} size="lg" />
            </Fact>
          )}
          {book.started && <Fact label="Started">{dayLabel(book.started, true)}</Fact>}
          {month && <Fact label="Finished">{month}</Fact>}
          {book.category && <Fact label="Shelf">{book.category}</Fact>}
          {book.published !== null && <Fact label="Published">{book.published}</Fact>}
          {book.pages !== null && <Fact label="Pages">{book.pages}</Fact>}
          {book.special && <Fact label="Copy">✦ A special copy</Fact>}
        </dl>
        <EditButton collection="books" slug={book.slug} />
      </DetailHero>

      {book.verdict && (
        <Section title="Verdict">
          <Paragraphs text={book.verdict} />
        </Section>
      )}
      {book.quotes && (
        <Section title="Quotes">
          <Quotes text={book.quotes} />
        </Section>
      )}
      {book.copyStory && (
        <Section title="Story of this copy">
          <Paragraphs text={book.copyStory} />
        </Section>
      )}
      {!hasNotes && <p className="text-sm text-ink-dim">No notes yet. Use Edit to add your opinion and verdict (quotes and the story of this copy can go in the note in Obsidian).</p>}
    </main>
  );
}
