import { OnThisDay } from "@/components/OnThisDay";
import { onThisDay } from "@/lib/vault/insights";
import { BalanceChart } from "@/components/BalanceChart";
import { HomeHub } from "@/components/HomeHub";
import { MonthCells } from "@/components/MonthStrip";
import { PageHeader } from "@/components/PageHeader";
import { SectionTile } from "@/components/SectionTile";
import { VaultWarnings } from "@/components/VaultWarnings";
import { plural } from "@/lib/format";
import { loadAchievements } from "@/lib/vault/achievements";
import { loadAreas } from "@/lib/vault/areas";
import { computeBalance, defaultWindow, MIN_DAYS, resolveAreas } from "@/lib/vault/balance";
import { computeProgress, type Progress } from "@/lib/vault/progress";
import { toYmd } from "@/lib/vault/habitWindow";
import { loadBooks } from "@/lib/vault/books";
import { loadCertificates } from "@/lib/vault/certificates";
import { balanceExtras } from "@/lib/vault/balanceData";
import { loadDaily } from "@/lib/vault/daily";
import { loadGames } from "@/lib/vault/games";
import { loadHabitDefinitions } from "@/lib/vault/habits";

// Counts only. Nothing private is shown here.
function countLine(n: number, word: string, empty: string): string {
  return n === 0 ? empty : plural(n, word);
}

// Runs while the page loads: if this home HTML was served for another address (the Android app's file
// server does that), load that page's own file instead. Never loops: an address ending in .html is left alone.
const HOME_ONLY = String.raw`(function(){var p=location.pathname;if(p!=="/"&&!/\.html$/.test(p))location.replace(p.replace(/\/?$/,"/")+"index.html"+location.search+location.hash)})()`;

export default function Home() {
  const books = loadBooks();
  const games = loadGames();
  const certificates = loadCertificates();
  const achievements = loadAchievements();
  const habits = loadHabitDefinitions();
  const daily = loadDaily(habits.items);
  const areas = loadAreas();

  const warnings = [books, games, certificates, achievements, habits, daily, areas].flatMap((r) => r.warnings);
  const balance = computeBalance(
    areas.items,
    resolveAreas(habits.items, areas.items, "Habit", warnings),
    daily.items,
    resolveAreas(achievements.items, areas.items, "Achievement", warnings),
    balanceExtras(daily.items),
    defaultWindow(new Date()).days,
  );
  const finishedGames = games.items.filter((g) => g.status === "finished").length;
  const activeHabits = habits.items.filter((h) => h.active).length;

  const lines = {
    library: countLine(books.items.length, "book", "No books yet"),
    games: countLine(games.items.length, "game", "No games yet") + (finishedGames > 0 ? ` · ${finishedGames} finished` : ""),
    certificates: countLine(certificates.items.length, "certificate", "No certificates yet"),
    achievements: countLine(achievements.items.length, "moment", "No achievements yet"),
    habits: countLine(activeHabits, "active habit", "No habits yet") + (daily.items.length > 0 ? ` · ${daily.items.length} days logged` : ""),
    balance: balanceLine(computeProgress(daily.items)),
  };

  return (
    <main data-theme="home" className="mx-auto w-full max-w-6xl px-5 pb-16 pt-6 sm:px-8 sm:pb-24 sm:pt-14">
      {/* In the Android app this HTML is also served for other addresses: jump to that page's own file. */}
      <script dangerouslySetInnerHTML={{ __html: HOME_ONLY }} />
      <PageHeader eyebrow="Welcome back" title="LifeOS" stats={["Everything in one place"]} />

      <HomeHub
        entries={[
          { key: "library", title: "The Library", href: "/library/", line: lines.library },
          { key: "games", title: "Games", href: "/games/", line: lines.games },
          { key: "certificates", title: "Certificates", href: "/certificates/", line: lines.certificates },
          { key: "achievements", title: "Achievements", href: "/achievements/", line: lines.achievements },
          { key: "habits", title: "Habits", href: "/habits/", line: lines.habits },
          { key: "balance", title: "Life areas", href: "/areas/", line: lines.balance },
        ]}
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <SectionTile
          href="/library/"
          section="library"
          eyebrow="Collection"
          title="The Library"
          line={lines.library}
        />
        <SectionTile
          href="/games/"
          section="games"
          eyebrow="Player one"
          title="Games"
          line={lines.games}
        />
        <SectionTile
          href="/certificates/"
          section="certificates"
          eyebrow="On the wall"
          title="Certificates"
          line={lines.certificates}
        />
        <SectionTile
          href="/achievements/"
          section="achievements"
          eyebrow="Trophy room"
          title="Achievements"
          line={lines.achievements}
        />
        <SectionTile
          href="/habits/"
          section="habits"
          eyebrow="Day by day"
          title="Habits"
          line={lines.habits}
        >
          <span className="flex flex-col gap-1.5">
            <MonthCells habits={habits.items} records={daily.items} today={new Date()} />
            <span className="text-[11px] text-ink-dim">This month, one square a day: fuller = more habits done</span>
          </span>
        </SectionTile>
        <SectionTile
          href="/areas/"
          section="balance"
          eyebrow="System"
          title="Life areas"
          line={lines.balance}
        >
          {balance.filter((b) => b.value !== null).length >= 3 ? (
            <span className="balance-tile-chart">
              <BalanceChart balance={balance} compact />
            </span>
          ) : (
            <span className="text-xs text-ink-dim">The graph fills in after {MIN_DAYS} logged days this month.</span>
          )}
        </SectionTile>
      </div>

      <OnThisDay memories={onThisDay(daily.items, toYmd(new Date()))} />

      <VaultWarnings warnings={warnings} />
    </main>
  );
}

// The Balance tile: this month against your own usual (src/lib/vault/progress.ts).
function balanceLine(p: Progress): string {
  if (p.month.score === null) return "How each area of life is going";
  const now = `This month ${Math.round(p.month.score * 100)}%`;
  if (p.month.diff === null) return now;
  const d = Math.round(p.month.diff * 100);
  return d === 0 ? `${now} · right at your usual` : `${now} · ${Math.abs(d)} ${d > 0 ? "above" : "below"} your usual`;
}
