// Copy the on-device model runtimes into public/ so the app serves them itself.
//
// MediaPipe's WASM used to come from a CDN pinned to the package version; a
// mismatch between the two made the detector fail with an opaque error, and a
// school network that blocks the CDN made it fail silently. Serving the files
// that npm installed removes both failure modes and lets the service worker
// cache them for use with no signal. Runs before `next build` and `next dev`.

import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const jobs = [
  {
    from: join(root, "node_modules/@mediapipe/tasks-vision/wasm"),
    to: join(root, "public/runtimes/mediapipe"),
    keep: (f) => /^vision_wasm_(nosimd_)?internal\.(js|wasm)$/.test(f),
  },
];

for (const job of jobs) {
  if (!existsSync(job.from)) {
    console.warn(`copy-runtimes: ${job.from} missing; run npm install first`);
    continue;
  }
  mkdirSync(job.to, { recursive: true });
  let n = 0;
  for (const f of readdirSync(job.from)) {
    if (!job.keep(f)) continue;
    copyFileSync(join(job.from, f), join(job.to, f));
    n++;
  }
  console.log(`copy-runtimes: ${n} file(s) -> ${job.to}`);
}
