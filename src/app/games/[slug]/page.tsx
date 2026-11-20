import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Backdrop } from "@/components/Backdrop";
import { DetailHero, Fact } from "@/components/DetailHero";
import { Paragraphs, Section } from "@/components/Prose";
import { Rating } from "@/components/Rating";
import { dayLabel, GAME_STATUS_LABEL, monthLabel, plural } from "@/lib/format";
import { getGame, staticSlugs } from "@/lib/vault/find";
import { EditButton } from "@/components/edit/EditTools";
import { Progress } from "@/components/Progress";
import { loadGames } from "@/lib/vault/games";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return staticSlugs(loadGames().items.map((g) => g.slug));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const game = getGame((await params).slug);
  return { title: game ? game.title : "Not found" };
}

export default async function GamePage({ params }: Props) {
  const game = getGame((await params).slug);
  if (!game) notFound();
  // "Finished" only makes sense for a finished game, even if the note has a date.
  const month = game.status === "finished" ? monthLabel(game.finished) : null;

  return (
    <div className="relative">
      <Backdrop path={game.backdrop} />
      <main data-theme="arcade" className="relative mx-auto flex w-full max-w-4xl flex-col gap-14 px-5 pb-24 pt-8 sm:px-8 sm:pt-10">
        <DetailHero
          back={{ href: "/games/", label: "Games" }}
          cover={{ path: game.poster, title: game.title, subtitle: game.platform, alt: `Poster of ${game.title}` }}
          glow={!game.backdrop}
        >
          <p className={`badge w-fit ${game.status === "playing" ? "badge-live" : ""}`}>{GAME_STATUS_LABEL[game.status]}</p>
          <h1 className="font-serif text-4xl leading-tight text-ink [overflow-wrap:anywhere] sm:text-5xl">{game.title}</h1>
          {(game.developer || game.series) && (
            <p className="text-lg text-ink-dim">
              {game.developer && <>by {game.developer}</>}
              {game.developer && game.series && <span className="mx-2 text-brass/60">·</span>}
              {game.series && <>{game.series} series</>}
            </p>
          )}
          {game.note && <p className="text-sm italic text-ink-dim">{game.note}</p>}
          {game.opinion && <p className="font-serif text-lg italic text-ink">&ldquo;{game.opinion}&rdquo;</p>}
          {game.status === "playing" && game.progress !== null && <Progress value={game.progress / 100} label={`${game.progress}% done`} />}
          <dl className="mt-1 flex flex-wrap gap-3">
            {game.rating !== null && (
              <Fact label="Rating">
                <Rating value={game.rating} size="lg" />
              </Fact>
            )}
            {game.released !== null && <Fact label="Released">{game.released}</Fact>}
            <Fact label="Platform">{game.platform}</Fact>
            {game.hours !== null && <Fact label="Played">{plural(game.hours, "hour")}</Fact>}
            {game.started && <Fact label="Started">{dayLabel(game.started, true)}</Fact>}
            {month && <Fact label="Finished">{month}</Fact>}
          </dl>
          <EditButton collection="games" slug={game.slug} />
        </DetailHero>

        {(game.genres.length > 0 || game.publisher) && (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {game.genres.length > 0 && <Fact label={game.genres.length > 1 ? "Genres" : "Genre"}>{game.genres.join(", ")}</Fact>}
            {game.publisher && <Fact label="Publisher">{game.publisher}</Fact>}
          </dl>
        )}

        {game.moment && (
          <Section title="The moment that stayed">
            <p className="moment font-serif text-xl italic leading-relaxed text-ink sm:text-2xl">{game.moment}</p>
          </Section>
        )}

        {game.verdict && (
          <Section title="Verdict">
            <Paragraphs text={game.verdict} />
          </Section>
        )}
        {!game.moment && !game.verdict && (
          <p className="text-sm text-ink-dim">No notes yet. Use Edit to add the moment that stayed, your opinion and a verdict.</p>
        )}
      </main>
    </div>
  );
}
