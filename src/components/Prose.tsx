// Plain text rendering for note sections. No markdown library on purpose.

function blocks(text: string): string[] {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((b) => b.trim())
    .filter((b) => b !== "");
}

export function Paragraphs({ text }: { text: string }) {
  return (
    <div className="prose-text flex flex-col gap-4">
      {blocks(text).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}

interface Quote {
  text: string;
  cite: string | null;
}

// Rules, matching how quotes look in Obsidian:
// - consecutive "> " lines form ONE quote; a blank line starts the next one
// - each "- " list item is its own quote
// - a line starting with "—", "–" or "--" is the attribution of the quote above it
// - with no markers at all, each paragraph is one quote
export function splitQuotes(text: string): Quote[] {
  const quotes: Quote[] = [];
  let current: string[] | null = null;

  const finish = () => {
    if (current && current.length > 0) quotes.push({ text: current.join(" "), cite: null });
    current = null;
  };
  const isCite = (l: string) => /^(—|–|--)\s*/.test(l);
  const addCite = (l: string) => {
    finish();
    const last = quotes[quotes.length - 1];
    const cite = l.replace(/^(—|–|--)\s*/, "").trim();
    if (last && last.cite === null && cite !== "") last.cite = cite;
  };

  const lines = text.split(/\r?\n/).map((l) => l.trim());
  if (!lines.some((l) => /^(>|-\s)/.test(l))) {
    return blocks(text).map((b) => ({ text: unwrap(b.replace(/\s*\r?\n\s*/g, " ")), cite: null }));
  }

  for (const line of lines) {
    if (line === "") {
      finish();
    } else if (line.startsWith(">")) {
      const inner = line.replace(/^>\s?/, "").trim();
      if (isCite(inner)) addCite(inner);
      else if (inner !== "") (current ??= []).push(inner);
    } else if (isCite(line)) {
      addCite(line);
    } else if (/^-\s/.test(line)) {
      finish();
      quotes.push({ text: line.replace(/^-\s+/, ""), cite: null });
    } else if (current) {
      current.push(line);
    } else {
      quotes.push({ text: line, cite: null });
    }
  }
  finish();
  return quotes.map((q) => ({ ...q, text: unwrap(q.text) }));
}

// The page draws its own quotation mark, so drop quotes the note already has around the text.
function unwrap(text: string): string {
  const m = /^["“'‘](.*)["”'’]$/s.exec(text.trim());
  return m ? m[1].trim() : text;
}

export function Quotes({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-6">
      {splitQuotes(text).map((q, i) => (
        <figure key={i} className="quote">
          <blockquote className="font-serif text-xl italic leading-relaxed text-ink">{q.text}</blockquote>
          {q.cite && <figcaption className="mt-2 text-sm text-ink-dim">— {q.cite}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="eyebrow ornament">{title}</h2>
      {children}
    </section>
  );
}
