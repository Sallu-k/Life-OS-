"use client";

import { useEffect, useRef } from "react";

// While a sheet, drawer or dialog is open, the phone's Back button (or the browser's) closes it
// instead of leaving the page. Opening adds one history entry (keeping Next's own state in it, so the
// router is not confused); Back pops it and we close; closing another way removes that entry again.
// To leave for another page from the sheet, call the returned `leaving()` and navigate with replace:
// the new page then takes the sheet's history entry, so Back goes to the page you came from.
export function useBackClose(open: boolean, close: () => void): () => void {
  const pushed = useRef(false);
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ ...(window.history.state ?? {}), lifeosSheet: true }, "");
    pushed.current = true;
    const onPop = () => {
      pushed.current = false;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed with a button or Escape: take our history entry away so Back does not land on it.
      if (pushed.current) {
        pushed.current = false;
        if (window.history.state?.lifeosSheet) window.history.back();
      }
    };
  }, [open]);
  return () => {
    pushed.current = false;
  };
}
