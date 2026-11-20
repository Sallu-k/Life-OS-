"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isApp } from "@/lib/api";
import { loadBundledPc } from "@/lib/connect";
import { syncPhoneAccent } from "@/lib/device";
import { primeFeel } from "@/lib/feel/sounds";

// Gets sound ready on the first tap. In the Android app: picks up the PC details built into the app
// (no typing), and opening the app goes straight to Today (Home stays under "More").
export function AppStart() {
  const router = useRouter();
  useEffect(() => {
    primeFeel();
    if (!isApp()) return;
    document.documentElement.dataset.app = "android";
    void loadBundledPc();
    void syncPhoneAccent();
    let first = true;
    try {
      first = !sessionStorage.getItem("lifeos-started");
      sessionStorage.setItem("lifeos-started", "1");
    } catch {
      // No session storage: go to Today anyway.
    }
    if (first && location.pathname === "/") router.replace("/today/");
  }, [router]);
  return null;
}
