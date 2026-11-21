import type { Metadata } from "next";
import { Reader } from "@/components/knowledge/Reader";

export const metadata: Metadata = { title: "Reader" };

// The book reader: a long read in pages, like an e-reader (/read/?book=<slug>, else the current book).
// The text is loaded live from the LifeOS server (or the phone's offline pack), never built into the site.
export default function ReadPage() {
  return (
    <main data-theme="home" className="reader-page">
      <Reader />
    </main>
  );
}
