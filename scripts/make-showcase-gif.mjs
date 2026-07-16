#!/usr/bin/env node
/**
 * make-showcase-gif.mjs — render the README's animated deck showcase.
 *
 * Fully scripted, zero manual steps, CI-reproducible (US-OSS-2):
 *   1. Export `slides-showcase.md` (a tiny page-range cut over the REAL
 *      section library) to per-click PNG frames with the pinned
 *      playwright-chromium that slidev export already uses.
 *   2. Assemble the frames into an animated GIF with the pinned `sharp`
 *      devDependency — no ad-hoc ffmpeg/ImageMagick installs.
 *
 * Usage: pnpm showcase:gif   (or: node scripts/make-showcase-gif.mjs)
 * Output: docs/images/deck-showcase.gif
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const framesDir = join(repoRoot, "dist-showcase-frames"); // gitignored (dist-*/)
const outGif = join(repoRoot, "docs", "images", "deck-showcase.gif");

// Assembly knobs.
const WIDTH = 960; // README display width; halves the export resolution
const CLICK_DELAY_MS = 900; // hold per intermediate click frame
const SLIDE_END_DELAY_MS = 2200; // hold on each slide's final frame
// Sanity bounds: catches a silently-empty export or a runaway click budget.
const MIN_FRAMES = 8;
const MAX_FRAMES = 60;

// --- 1. Export per-slide / per-click PNG frames from the real deck ---------

rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

// Invoke the local slidev binary directly (works from worktrees and CI alike).
const slidevBin = join(repoRoot, "node_modules", ".bin", "slidev");
if (!existsSync(slidevBin)) {
  console.error("slidev binary not found — run `pnpm install` first.");
  process.exit(1);
}

// NOTE: deliberately NOT --per-slide. In one-piece mode slidev's print page
// renders one `.print-slide-container` PER CLICK STATE and screenshots each
// (frames named `NNN-CC.png`); the per-slide code path only ever captures
// click state 0 in this slidev version. Global chrome (footer, page number,
// progress bar) renders correctly in the print containers.
console.log("Exporting showcase frames (slides-showcase.md, with clicks) …");
execFileSync(
  slidevBin,
  [
    "export",
    "slides-showcase.md",
    "--format", "png",
    "--with-clicks",
    "--wait", "700", // let fonts/CSS transitions settle before capture
    "--output", framesDir,
  ],
  { cwd: repoRoot, stdio: "inherit", env: { ...process.env, CI: "true" } },
);

// --- 2. Collect and order the frames ---------------------------------------

// slidev names frames by slide (and click) number; sort by the numeric parts
// so `10` never sorts before `2`.
const numericParts = (name) => (name.match(/\d+/g) ?? []).map(Number);
const frames = readdirSync(framesDir)
  .filter((f) => f.endsWith(".png"))
  .sort((a, b) => {
    const pa = numericParts(a);
    const pb = numericParts(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] ?? -1) - (pb[i] ?? -1);
      if (d !== 0) return d;
    }
    return a.localeCompare(b);
  });

if (frames.length < MIN_FRAMES || frames.length > MAX_FRAMES) {
  console.error(
    `Unexpected frame count ${frames.length} (expected ${MIN_FRAMES}–${MAX_FRAMES}). ` +
      "Did a showcase page range in slides-showcase.md drift?",
  );
  process.exit(1);
}
console.log(`Assembling ${frames.length} frames → ${outGif}`);

// --- 3. Assemble the GIF with the pinned sharp devDependency ---------------

const { default: sharp } = await import("sharp");

// Slide number = first numeric group in the filename; the last frame of each
// slide (final click state) holds longer so the finished diagram is readable.
const slideOf = (name) => numericParts(name)[0];
const delays = frames.map((f, i) => {
  const isSlideEnd = i === frames.length - 1 || slideOf(frames[i + 1]) !== slideOf(f);
  return isSlideEnd ? SLIDE_END_DELAY_MS : CLICK_DELAY_MS;
});

const resized = await Promise.all(
  frames.map((f) =>
    sharp(join(framesDir, f)).resize({ width: WIDTH }).png().toBuffer(),
  ),
);

await sharp(resized, { join: { animated: true } })
  .gif({ delay: delays, loop: 0, effort: 7 })
  .toFile(outGif);

// --- 4. Verify the artifact -------------------------------------------------

const header = readFileSync(outGif).subarray(0, 6).toString("latin1");
if (header !== "GIF89a" && header !== "GIF87a") {
  console.error(`Output is not a GIF (header ${JSON.stringify(header)}).`);
  process.exit(1);
}
const sizeMiB = statSync(outGif).size / (1024 * 1024);
console.log(`OK: ${frames.length} frames, ${sizeMiB.toFixed(2)} MiB, header ${header}.`);
if (sizeMiB > 15) {
  console.error("GIF exceeds 15 MiB — trim the showcase cut or lower WIDTH.");
  process.exit(1);
}
