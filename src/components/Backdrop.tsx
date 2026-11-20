import { assetUrl } from "@/lib/vault/assets";

// A wide image behind the top of a detail page, fading into the background.
// Decorative only (the poster and title carry the meaning), so screen readers skip it.
export function Backdrop({ path }: { path: string | null }) {
  const src = assetUrl(path);
  if (!src) return null;
  return (
    <div className="backdrop-banner" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" decoding="async" />
    </div>
  );
}
