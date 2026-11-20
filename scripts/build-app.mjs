// Builds the Android app: the static site, copied into the Android project, then a debug APK.
// Run with: npm run app:android   (result: LifeOS-app.apk in the project folder)
// Gradle builds into .android-build/ (android/build-dir.gradle), so an editor holding the Android
// project open cannot lock the output.
// JAVA_HOME and ANDROID_HOME are taken from the environment, or the usual Windows places when unset.
//
// The app also gets this PC's addresses and the phone token (lifeos-pc.json), so it connects without
// any typing. That file lives only inside the app (never in out/ or git); keep the APK private.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { join } from "node:path";
import { siteManifest } from "./lib/appBundle.mjs";
import { loadEnvLocal } from "./lib/vault-write.mjs";

const env = { ...process.env };
if (!env.JAVA_HOME) {
  const dir = "C:/Program Files/Java";
  const jdk = existsSync(dir) ? readdirSync(dir).filter((d) => d.startsWith("jdk-")).sort().pop() : null;
  if (jdk) env.JAVA_HOME = join(dir, jdk);
}
if (!env.ANDROID_HOME) env.ANDROID_HOME = join(homedir(), "AppData/Local/Android/Sdk");

// The same addresses the LifeOS server accepts the phone on: home network first, then Tailscale.
function pcAddresses(port = 4173) {
  const ips = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal)
    .map((a) => a.address);
  const lan = ips.filter((ip) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) && !ip.startsWith("192.168.56."));
  const tailscale = ips.filter((ip) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip));
  return [...lan, ...tailscale].map((ip) => `http://${ip}:${port}`);
}

const run = (cmd, cwd = ".") => execSync(cmd, { cwd, env, stdio: "inherit" });
run("npm run build");
run("npx cap sync android");

loadEnvLocal();
const pc = { urls: pcAddresses(), token: process.env.LIFEOS_TOKEN ?? "" };
writeFileSync("android/app/src/main/assets/public/lifeos-pc.json", JSON.stringify(pc));
console.log(`Built in the PC details: ${pc.urls.join(", ") || "no network address found"}${pc.token ? " + token" : " (no token yet: run npm start once)"}`);
// The file list of what is inside the APK, so live updates later download only what changed.
writeFileSync("android/app/src/main/assets/public/app-manifest.json", JSON.stringify(siteManifest("android/app/src/main/assets/public", { cacheIt: false })));

// A new version number each build (minutes since 2026), so Android and Capacitor see a new app and
// drop any older live update.
const code = Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 60000);
const name = new Date().toISOString().slice(0, 16).replace("T", " ");
const gradle = process.platform === "win32" ? ".\\gradlew.bat" : "./gradlew";
run(`${gradle} -I build-dir.gradle assembleDebug -PlifeosVersionCode=${code} "-PlifeosVersionName=${name}"`, "android");
copyFileSync(".android-build/app/outputs/apk/debug/app-debug.apk", "LifeOS-app.apk");

// Let the running LifeOS server show this same build, so the phone and the PC agree on the version.
try {
  const res = await fetch("http://127.0.0.1:4173/api/app/publish", { method: "POST" });
  console.log(res.ok ? `PC site now on the same build (${(await res.json()).version}).` : "PC site not updated (it rebuilds on its own after the next edit).");
} catch {
  console.log("LifeOS server not running: the PC site will catch up when it starts.");
}
console.log("\nAPK ready: LifeOS-app.apk (in the project folder)");
