"use client";

// The strong on-device read of one still picture.
//
// The live view runs the detector once per frame at video resolution; this is
// what a still frame can afford instead: the whole picture plus four zoomed
// tiles through the detector, each box checked by the classifier, and the
// pixel light finder at four times the live resolution. It is the on-device
// "confirm" step - the same code a photo goes through - so a live candidate
// and a confirmed reading are never two different answers to one picture.

import { detectStill, verifyStill } from "./detector";
import { readScene, type SceneRead } from "./scene";
import { withLamps } from "./verify";
import { FrameReader, loadImage } from "./media";
import { readItems, type LiveItem } from "./ondevice";
import type { AuditSettings } from "./types";

export interface StillRead {
  items: LiveItem[];
  scene: SceneRead | null;
  /** How long each stage took, ms, so the UI can say and the bench can tune. */
  timing: { detect: number; verify: number; scene: number; total: number };
}

const GLOWING = new Set(["tv", "laptop", "cell phone"]);

/** Read a still (a data URL, or a canvas / image already in hand) on the device. */
export async function readStill(src: string | HTMLCanvasElement | HTMLImageElement, settings: AuditSettings): Promise<StillRead> {
  const el = typeof src === "string" ? await loadImage(src) : src;
  const t0 = performance.now();
  const raw = await detectStill(el).catch(() => []);
  const t1 = performance.now();
  const { dets, lamps } = await verifyStill(el, raw).catch(() => ({ dets: raw, lamps: [] }));
  const t2 = performance.now();
  // A still can afford a finer read than live video: far downlights are a few pixels at 256.
  const px = new FrameReader(640).read(el);
  const scene = px ? readScene(px.data, px.w, px.h, px.rgba) : null;
  const t3 = performance.now();
  if (scene && px && lamps.length) {
    // A glowing phone, screen or laptop is not a lamp.
    const blockers = dets.filter((d) => GLOWING.has(d.cls)).map((d) => d.box);
    scene.lights = withLamps(scene.lights, lamps.map((box) => ({ box, confidence: 0.7 })), px, blockers);
    if (scene.lights.length) scene.lighting = "on";
  }
  const items = readItems(dets, scene?.lights ?? [], settings, px ?? undefined);
  return { items, scene, timing: { detect: t1 - t0, verify: t2 - t1, scene: t3 - t2, total: performance.now() - t0 } };
}
