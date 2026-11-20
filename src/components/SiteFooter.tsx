import Link from "next/link";

// Quiet footer with the build date, so it is easy to see how fresh the site is.
export function SiteFooter() {
  const built = new Date().toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <footer className="site-footer mt-auto border-t border-ink-dim/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-6 text-xs text-ink-dim sm:px-8">
        <span>
          <span className="text-brass" aria-hidden="true">✦ </span>
          LifeOS · private
        </span>
        <Link href="/settings/" className="hover:text-ink">Settings</Link>
        <span>Built {built}</span>
      </div>
    </footer>
  );
}
