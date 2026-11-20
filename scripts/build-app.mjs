// Builds the Android app: the static site, copied into the Android project, then a debug APK.
// Run with: npm run app:android   (result: LifeOS-app.apk in the project folder)
// Gradle builds into .android-build/ (android/build-dir.gradle), so an editor holding the Android
// project open cannot lock the output.
// JAVA_HOME and ANDROID_HOME are taken from the environment, or the usual Windows places when unset.
//
// The app also gets this PC's addresses and the phone token (lifeos-pc.json), so it connects without
// any typing. That file lives only inside the app (never in out/ or git); keep the APK private.
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { join } from "node:path";
import { siteManifest } from "./lib/appBundle.mjs";
import { publicUpdateKey } from "./lib/updateKey.mjs";
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
// Addresses seen in earlier builds are kept too: Tailscale may be switched off while building, but its
// address does not change, and the phone needs it away from home.
const seenFile = join(process.env.LOCALAPPDATA ?? homedir(), "LifeOS", "pc-addresses.json");
let seen = [];
try {
  seen = JSON.parse(readFileSync(seenFile, "utf8"));
} catch {
  seen = [];
}
const urls = [...new Set([...pcAddresses(), ...seen.filter((u) => typeof u === "string" && /^http:\/\/[\d.]+:\d+$/.test(u))])];
mkdirSync(join(seenFile, ".."), { recursive: true });
writeFileSync(seenFile, JSON.stringify(urls));
// updateKey: the public half of the key that signs live updates (scripts/lib/updateKey.mjs).
const pc = { urls, token: process.env.LIFEOS_TOKEN ?? "", updateKey: publicUpdateKey() };
writeFileSync("android/app/src/main/assets/public/lifeos-pc.json", JSON.stringify(pc));
console.log(`Built in the PC details: ${pc.urls.join(", ") || "no network address found"}${pc.token ? " + token" : " (no token yet: run npm start once)"}`);
// The file list of what is inside the APK, so live updates later download only what changed.
writeFileSync("android/app/src/main/assets/public/app-manifest.json", JSON.stringify(siteManifest("android/app/src/main/assets/public", { cacheIt: false })));

// A new version number each build (minutes since 2026), so Android and Capacitor see a new app and
// drop any older live update.
const code = Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 60000);
const name = new Date().toISOString().slice(0, 16).replace("T", " ");
// Signed as a release with your own key (LIFEOS_SIGN_NAME in .env.local, default "LifeOS"), not Android's shared test key, which Play
// Protect distrusts. The key lives outside the repo (%LOCALAPPDATA%/LifeOS) and its password in .env.local;
// both are made on the first build. Keep a copy of both: an APK signed with a different key cannot update
// the installed app (it would have to be uninstalled first).
const keyDir = join(process.env.LOCALAPPDATA ?? homedir(), "LifeOS");
const keystore = join(keyDir, "lifeos-release.jks");
let keyPass = process.env.LIFEOS_KEYSTORE_PASSWORD;
if (!keyPass) {
  keyPass = randomBytes(18).toString("base64url");
  appendFileSync(".env.local", `\n# Password of the phone app's signing key (%LOCALAPPDATA%/LifeOS/lifeos-release.jks). Keep both safe.\nLIFEOS_KEYSTORE_PASSWORD=${keyPass}\n`);
}
const signName = (process.env.LIFEOS_SIGN_NAME || "LifeOS").replace(/[^\w .-]/g, "").slice(0, 60) || "LifeOS";
if (!existsSync(keystore)) {
  mkdirSync(keyDir, { recursive: true });
  const keytool = env.JAVA_HOME ? `"${join(env.JAVA_HOME, "bin", "keytool")}"` : "keytool";
  run(`${keytool} -genkeypair -keystore "${keystore}" -alias lifeos -keyalg RSA -keysize 4096 -validity 36500 -dname "CN=${signName}, O=${signName}" -storepass ${keyPass} -keypass ${keyPass}`);
}
const sign = [`-Pandroid.injected.signing.store.file="${keystore}"`, `-Pandroid.injected.signing.store.password=${keyPass}`, "-Pandroid.injected.signing.key.alias=lifeos", `-Pandroid.injected.signing.key.password=${keyPass}`].join(" ");
const gradle = process.platform === "win32" ? ".\\gradlew.bat" : "./gradlew";
run(`${gradle} -I build-dir.gradle assembleRelease ${sign} -PlifeosVersionCode=${code} "-PlifeosVersionName=${name}"`, "android");
copyFileSync(".android-build/app/outputs/apk/release/app-release.apk", "LifeOS-app.apk");

// Let the running LifeOS server show this same build, so the phone and the PC agree on the version.
try {
  const res = await fetch("http://127.0.0.1:4173/api/app/publish", { method: "POST" });
  console.log(res.ok ? `PC site now on the same build (${(await res.json()).version}).` : "PC site not updated (it rebuilds on its own after the next edit).");
} catch {
  console.log("LifeOS server not running: the PC site will catch up when it starts.");
}
console.log("\nAPK ready: LifeOS-app.apk (in the project folder)");
