"use client";

// The header's "+" for Quick add (same as Ctrl+K). Shown on wider screens.
export function QuickAddButton() {
  return (
    <button type="button" className="quick-add-button" title="Quick add (Ctrl+K)" aria-label="Quick add (Ctrl+K)" onClick={() => window.dispatchEvent(new Event("lifeos-quickadd"))}>
      +
    </button>
  );
}
