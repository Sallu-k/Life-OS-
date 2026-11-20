import type { Metadata, Viewport } from "next";
import { AppStart } from "@/components/AppStart";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { TabBar } from "@/components/TabBar";
import { QuickAdd } from "@/components/QuickAdd";
import { UpdateBanner } from "@/components/UpdateBanner";
import { PhoneExtras } from "@/components/PhoneExtras";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LifeOS", template: "%s · LifeOS" },
  description: "A private space for your habits, tasks, books, games, certificates and life areas.",
  robots: { index: false, follow: false }, // private site: never indexed
  // Raster icons too: Windows uses them for the app window and taskbar (it cannot use the SVG favicon).
  icons: {
    icon: [
      { url: "/icons/lifeos.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/icons/icon-192.png",
  },
};

// Draw under the phone's status and navigation bars; the page pads itself (see .site-header, .tab-bar).
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#121316" };

// The Android app's file server answers every page address with the home page's HTML. The home page then
// jumps to the real file (/settings/index.html) and this tidies the address back to /settings/ before the
// page starts. On the PC nothing happens.
const ROUTE_FIX = String.raw`(function(){var p=location.pathname;if(/\/index\.html$/.test(p))history.replaceState(null,"",p.slice(0,-10)+location.search+location.hash)})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: ROUTE_FIX }} />
      </head>
      <body>
        <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-ink">
          Skip to content
        </a>
        <SiteHeader />
        <div id="content" className="flex flex-1 flex-col">
          {children}
        </div>
        <SiteFooter />
        <TabBar />
        <QuickAdd />
        <UpdateBanner />
        <PhoneExtras />
        <AppStart />
      </body>
    </html>
  );
}
