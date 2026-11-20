// Prints vault warnings to the terminal (during dev/build) and shows a quiet count on the page.
// Warnings only contain file paths and field names, never note text.
export function VaultWarnings({ warnings }: { warnings: string[] }) {
  for (const w of warnings) console.warn(`[vault] ${w}`);
  if (warnings.length === 0) return null;
  return (
    <p className="mt-16 text-xs text-ink-dim">
      {warnings.length} vault warning{warnings.length > 1 ? "s" : ""}. Check the terminal output of <code>npm run dev</code> or <code>npm run build</code>.
    </p>
  );
}
