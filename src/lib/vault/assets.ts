// Asset paths in notes are vault-relative. They are copied to public/vault-assets by scripts/sync-assets.mjs.
// Kept separate from paths.ts (which uses Node) so browser components can use it too.
export function assetUrl(vaultRelative: string | null): string | null {
  if (!vaultRelative) return null;
  const withoutPrefix = vaultRelative.replace(/^_assets\//, "");
  return `/vault-assets/${withoutPrefix}`;
}
