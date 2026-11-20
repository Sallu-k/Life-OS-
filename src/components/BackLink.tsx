import Link from "next/link";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="group inline-flex w-fit items-center gap-2 rounded-sm text-sm text-ink-dim transition-colors hover:text-ink">
      <span aria-hidden="true" className="transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none">
        ←
      </span>
      Back to {label}
    </Link>
  );
}
