import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-5 px-5 py-24 text-center">
      <p className="eyebrow">Lost in the stacks</p>
      <h1 className="page-title">Page not found</h1>
      <p className="text-ink-dim">This page does not exist, or the note behind it was renamed.</p>
      <Link href="/" className="chip mt-2">
        Back home
      </Link>
    </main>
  );
}
