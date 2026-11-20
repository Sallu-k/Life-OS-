import type { CapacitorConfig } from "@capacitor/cli";

// The Android app: the same static site (out/) bundled into an app, talking to the PC over home Wi-Fi
// or Tailscale. Build it with: npm run app:android  (see README.md, "Phone app").
const config: CapacitorConfig = {
  appId: "com.lifeos.app",
  appName: "LifeOS",
  webDir: "out",
  backgroundColor: "#121316", // the home theme's --bg (config files cannot read CSS variables)
  server: {
    // The PC server speaks plain http on the private network, so the app page is http too.
    androidScheme: "http",
    cleartext: true,
  },
  plugins: {
    // Light status-bar icons on the dark page (the owner uses dark mode); the page pads itself with the
    // --safe-area-inset-* values.
    SystemBars: { style: "DARK", insetsHandling: "css" },
    // The LifeOS ring and check as the small notification icon, tinted the icon's sage green.
    LocalNotifications: { smallIcon: "ic_stat_lifeos", iconColor: "#7fbf9e" },
  },
};

export default config;
