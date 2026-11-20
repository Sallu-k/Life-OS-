// Writes out/build-info.json with the build time, so the phone app's live updates only ever move to a
// newer build (never back to an older one). Runs after every `next build` (package.json postbuild).
import { writeFileSync } from "node:fs";

writeFileSync("out/build-info.json", JSON.stringify({ builtAt: Date.now() }));
console.log("[stamp-build] out/build-info.json written");
