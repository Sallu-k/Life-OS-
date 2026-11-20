import Link from "next/link";
import { GAME_STATUS_LABEL } from "@/lib/format";
import type { Game } from "@/lib/vault/types";
import { Cover } from "./Cover";
import { Progress } from "./Progress";
import { Rating } from "./Rating";

export function GameTile({ game }: { game: Game }) {
  const byline = [game.released, game.developer].filter(Boolean).join(" · ") || game.platform;
  return (
    <Link href={`/games/${game.slug}/`} className="tile group flex flex-col gap-3 rounded-md">
      <Cover path={game.poster} title={game.title} subtitle={game.platform} alt={`Poster of ${game.title}`} ornament={game.status !== "playing"}>
        {game.status === "playing" && <span className="badge badge-live absolute left-2 top-2 z-10">Playing</span>}
        {game.status !== "playing" && game.status !== "finished" && (
          <span className="badge absolute left-2 top-2 z-10">{GAME_STATUS_LABEL[game.status]}</span>
        )}
      </Cover>
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-[0.95rem] leading-snug text-ink">{game.title}</h2>
        <p className="text-xs text-ink-dim">{byline}</p>
        {game.rating !== null && <Rating value={game.rating} />}
        {game.status === "playing" && game.progress !== null && <Progress value={game.progress / 100} label={`${game.progress}%`} small />}
      </div>
    </Link>
  );
}
