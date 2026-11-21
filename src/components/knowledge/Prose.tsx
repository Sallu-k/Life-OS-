import { Fragment } from "react";

// A passage's text: paragraphs split by blank lines, "> " lines as the quote that opens a chapter
// (a line starting with a dash is its source), and *italics* (thoughts, titles).
export function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\s*\n/).map((p, i) => {
        if (!p.startsWith("> ")) return <p key={i}>{inline(p)}</p>;
        const q = p.slice(2);
        return (
          <blockquote key={i} className={/^\*?[-—–]/.test(q) ? "prose-source" : undefined}>
            {inline(q)}
          </blockquote>
        );
      })}
    </>
  );
}

function inline(t: string) {
  return t.split(/(\*[^*\n]+\*)/).map((s, i) => (s.length > 2 && s.startsWith("*") && s.endsWith("*") ? <em key={i}>{s.slice(1, -1)}</em> : <Fragment key={i}>{s}</Fragment>));
}
