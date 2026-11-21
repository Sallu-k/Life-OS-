"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useIsApp, useServer } from "@/lib/api";
import { feel } from "@/lib/feel/sounds";
import { reducedMotion } from "@/lib/feel/motion";
import { loadPassages, logEvent, passageId, resumeAt, type Library, type Passage } from "@/lib/knowledge";
import { readKept } from "@/lib/offline";
import { Prose } from "./Prose";

// The book reader (/read/): a long read laid out in pages like an e-reader. The text flows into columns
// as wide as the screen and each turn slides one column over. Tap the right side (or swipe left, or →)
// for the next page, the left side for the previous one, the middle for the bars. Parts come in chunks
// from the PC (or the offline pack) and every part you read past moves the bookmark (Logs/Knowledge).
// Live only: no book text is ever built into the site.

type Book = Library["books"][number];
const CHUNK = 20; // parts per load (about 10 phone pages)
const GAP = 48; // px between columns (only seen while sliding)
const SIZES = [16, 17, 18, 19, 20, 22, 24, 27];
const LOOKS = [
  ["night", "Night"],
  ["sepia", "Sepia"],
  ["paper", "Paper"],
] as const;
type Look = (typeof LOOKS)[number][0];
const WORDS_PER_PART = 138; // average part (scripts/add-knowledge.mjs), for "min left in chapter"
const WPM = 230;

function remembered<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
const remember = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // not kept: the default comes back next time
  }
};

export function Reader() {
  const server = useServer();
  const app = useIsApp();
  const [book, setBook] = useState<Book | null>(null);
  const [parts, setParts] = useState<Passage[]>([]);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [chrome, setChrome] = useState(true);
  const [panel, setPanel] = useState<"none" | "type" | "contents">("none");
  const [size, setSize] = useState(19);
  const [look, setLook] = useState<Look>("night");
  const [msg, setMsg] = useState("");
  const [atEnd, setAtEnd] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const flow = useRef<HTMLDivElement>(null);
  const width = useRef(0);
  const bookmark = useRef(0); // next part not yet logged as read
  const loading = useRef(false);
  const anchor = useRef<number | null>(null); // part to keep in view after the layout changes
  const anchorShift = useRef(0); // pages from that part's first page (-1: the page before it)
  const [slide, setSlide] = useState(false);

  useEffect(() => {
    setSize(remembered("lifeos-reader-size", 19));
    setLook(remembered<Look>("lifeos-reader-look", "night"));
  }, []);

  // Which book: ?book=<slug>, else the current one (the one on the Gate).
  useEffect(() => {
    if (!server && !app) return;
    const wanted = new URLSearchParams(window.location.search).get("book");
    readKept<Library>("knowledge/library").then(
      ({ data }) => {
        const b = data?.books.find((x) => x.slug === wanted) ?? data?.books.find((x) => x.current) ?? data?.books[0] ?? null;
        if (!b) return setMsg("No long reads yet. Add one on the PC: npm run add-knowledge.");
        setBook(b);
        open(b, resumeAt(b.slug, b.position));
      },
      (e: Error) => setMsg(e.message),
    );
    // open() only uses refs and setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, app]);

  async function open(b: Book, from: number) {
    loading.current = true;
    try {
      const got = await loadPassages(b.slug, CHUNK, Math.min(from, Math.max(0, b.total - 1)));
      bookmark.current = Math.max(bookmark.current, from); // going back to a chapter never logs it twice
      anchor.current = null;
      setParts(got);
      setPage(0);
      setAtEnd(false);
      setMsg(got.length ? "" : "This part is not saved on this phone yet. It comes when the PC is reachable.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      loading.current = false;
    }
  }

  // ---------- layout: columns as wide as the frame ----------
  const stride = () => width.current + GAP;
  const pageOf = useCallback((el: Element | null) => {
    if (!el || !flow.current) return 0;
    return Math.max(0, Math.floor((el.getBoundingClientRect().left - flow.current.getBoundingClientRect().left + 1) / stride()));
  }, []);

  const measure = useCallback(() => {
    const f = frame.current;
    const inner = flow.current;
    if (!f || !inner) return;
    width.current = f.clientWidth;
    inner.style.columnWidth = `${width.current}px`;
    const total = Math.max(1, Math.round((inner.scrollWidth + GAP) / stride()));
    setPages(total);
    if (anchor.current !== null) {
      const el = inner.querySelector(`[data-part="${anchor.current}"]`);
      const to = pageOf(el) + anchorShift.current;
      anchor.current = null;
      anchorShift.current = 0;
      setPage(Math.max(0, Math.min(total - 1, to)));
    } else setPage((p) => Math.min(p, total - 1));
  }, [pageOf]);

  useLayoutEffect(measure, [parts, size, measure]);
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      anchor.current = partOnPage(page);
      measure();
    });
    if (frame.current) ro.observe(frame.current);
    return () => ro.disconnect();
    // the observer only needs the page at the time it fires
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, page]);

  // The first part that starts on or before this page (the one being read).
  function partOnPage(p: number): number | null {
    let found: number | null = null;
    for (const part of parts) if (pageOf(flow.current?.querySelector(`[data-part="${part.index}"]`) ?? null) <= p) found = part.index;
    return found;
  }

  // ---------- reading progress: parts read past are logged once, forward only ----------
  useEffect(() => {
    if (!book || !flow.current) return;
    for (const part of parts) {
      if (part.index < bookmark.current) continue;
      const end = flow.current.querySelector(`[data-end="${part.index}"]`);
      if (!end || pageOf(end) >= page) break; // in order: stop at the first part not read to its end
      logEvent({ kind: "passage", id: passageId(part) });
      bookmark.current = part.index + 1;
    }
    // near the end of what is loaded: fetch the next parts
    if (page >= pages - 3) void more();
    // more() reads state through refs and the latest parts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pages, parts, book]);

  async function more() {
    const last = parts[parts.length - 1];
    if (!book || !last || loading.current || last.index + 1 >= book.total) return;
    loading.current = true;
    try {
      const got = await loadPassages(book.slug, CHUNK, last.index + 1);
      if (got.length) setParts((p) => [...p, ...got.filter((g) => g.index > p[p.length - 1].index)]);
    } catch {
      // offline and not kept: the end of what is on the phone
    } finally {
      loading.current = false;
    }
  }

  async function earlier() {
    const first = parts[0];
    if (!book || !first || first.index === 0 || loading.current) return false;
    loading.current = true;
    try {
      const from = Math.max(0, first.index - CHUNK);
      const got = (await loadPassages(book.slug, first.index - from, from)).filter((g) => g.index < first.index);
      if (!got.length) return false;
      anchor.current = first.index; // land on the page just before the old first part
      anchorShift.current = -1;
      setParts((p) => [...got, ...p]);
      return true;
    } catch {
      return false;
    } finally {
      loading.current = false;
    }
  }

  // ---------- turning ----------
  const turn = (to: number) => {
    setSlide(!reducedMotion());
    setPage(to);
  };
  function next() {
    if (page < pages - 1) return turn(page + 1);
    const last = parts[parts.length - 1];
    if (book && last && last.index + 1 >= book.total) {
      if (!atEnd) {
        logEvent({ kind: "passage", id: passageId(last) }); // the last page: the book is finished
        feel("finished");
      }
      setAtEnd(true);
    } else void more();
  }
  async function prev() {
    if (atEnd) return setAtEnd(false);
    if (page > 0) return turn(page - 1);
    await earlier();
  }

  // Taps: left third back, right third forward, middle shows the bars. Swipes turn too.
  const down = useRef<{ x: number; y: number } | null>(null);
  function pointerUp(e: React.PointerEvent) {
    const start = down.current;
    down.current = null;
    if (!start || panel !== "none") return setPanel("none");
    const dx = e.clientX - start.x;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - start.y)) return dx < 0 ? next() : void prev();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const at = (e.clientX - rect.left) / rect.width;
    if (at < 0.3) void prev();
    else if (at > 0.7) next();
    else setChrome((c) => !c);
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " "].includes(e.key)) (e.preventDefault(), next());
      if (["ArrowLeft", "PageUp"].includes(e.key)) (e.preventDefault(), void prev());
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  function setFont(step: number) {
    const i = Math.max(0, Math.min(SIZES.length - 1, SIZES.indexOf(size) + step));
    anchor.current = partOnPage(page);
    setSize(SIZES[i]);
    remember("lifeos-reader-size", SIZES[i]);
    feel("select");
  }
  function pickLook(l: Look) {
    setLook(l);
    remember("lifeos-reader-look", l);
    feel("select");
  }

  // ---------- what the footer says ----------
  const reading = parts.find((p) => p.index === partOnPage(page)) ?? parts[0];
  const chapters = book?.chapters ?? [];
  const nextChapter = reading ? chapters.find((c) => c.index > reading.index) : undefined;
  const leftParts = reading && book ? (nextChapter ? nextChapter.index : book.total) - reading.index : 0;
  const minutes = Math.max(1, Math.round((leftParts * WORDS_PER_PART) / WPM));
  const percent = reading && book ? Math.floor((100 * reading.index) / book.total) : 0;

  if (!app && server === false)
    return <p className="card m-6 p-5 text-sm text-ink-dim">The reader works through the LifeOS server. On the PC run npm start and open the address it prints.</p>;

  return (
    <div className="reader" data-look={look} style={{ ["--reader-size" as string]: `${size}px` }}>
      <header className={`reader-bar reader-top ${chrome ? "" : "reader-hidden"}`}>
        <button type="button" className="reader-icon" onClick={() => (history.length > 1 ? history.back() : (location.href = "/knowledge/"))} aria-label="Close the book">
          ←
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold">{book?.title ?? "Reader"}</p>
          {reading?.chapter && <p className="truncate text-xs opacity-70">{reading.chapter}</p>}
        </div>
        {chapters.length > 1 && (
          <button type="button" className="reader-icon" onClick={() => setPanel(panel === "contents" ? "none" : "contents")} aria-label="Contents">
            ☰
          </button>
        )}
        <button type="button" className="reader-icon" onClick={() => setPanel(panel === "type" ? "none" : "type")} aria-label="Text size and colours">
          Aa
        </button>
      </header>

      {panel === "type" && (
        <div className="reader-panel" role="dialog" aria-label="Text">
          <div className="flex items-center justify-between gap-3">
            <button type="button" className="reader-chip" onClick={() => setFont(-1)} aria-label="Smaller text">
              A−
            </button>
            <span className="text-sm opacity-70">{size} px</span>
            <button type="button" className="reader-chip text-lg" onClick={() => setFont(1)} aria-label="Bigger text">
              A+
            </button>
          </div>
          <div className="flex gap-2">
            {LOOKS.map(([key, label]) => (
              <button key={key} type="button" className="reader-chip reader-swatch flex-1" data-swatch={key} aria-pressed={look === key} onClick={() => pickLook(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {panel === "contents" && book && (
        <div className="reader-panel reader-contents" role="dialog" aria-label="Contents">
          {chapters.map((c) => (
            <button
              key={c.index}
              type="button"
              className={`reader-toc ${reading?.chapter === c.title ? "reader-toc-here" : ""}`}
              onClick={() => (setPanel("none"), feel("open"), open(book, c.index))}
            >
              {c.title}
            </button>
          ))}
        </div>
      )}

      <div
        ref={frame}
        className="reader-frame"
        onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={pointerUp}
        onPointerCancel={() => (down.current = null)}
      >
        {msg && <p className="reader-msg">{msg}</p>}
        <div
          ref={flow}
          lang="en"
          className="reader-flow"
          style={{ columnGap: GAP, transform: `translateX(${-page * (width.current + GAP)}px)`, transition: slide ? "transform 260ms cubic-bezier(.2,.7,.2,1)" : "none" }}
          onTransitionEnd={() => setSlide(false)}
        >
          {parts.map((p) => (
            <section key={p.index} data-part={p.index} className={p.chapterStart ? "reader-chapter-start" : undefined}>
              {p.chapterStart && p.chapter && <h2 className="reader-chapter">{p.chapter}</h2>}
              <Prose text={p.text} />
              <span data-end={p.index} />
            </section>
          ))}
        </div>
        {atEnd && (
          <div className="reader-end">
            <p className="text-2xl">The end</p>
            <p className="text-sm opacity-70">{book?.title} is finished. Well read.</p>
            <a className="reader-chip" href="/knowledge/">
              Back to Knowledge
            </a>
          </div>
        )}
      </div>

      <footer className={`reader-bar reader-foot ${chrome ? "" : "reader-quiet"}`}>
        <span>{reading?.chapter ? `${minutes} min left in chapter` : `${minutes} min left`}</span>
        <span>{percent}%</span>
        <div className="reader-progress" style={{ width: `${percent}%` }} />
      </footer>
    </div>
  );
}
