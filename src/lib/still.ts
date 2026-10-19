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
}

/** Read a still (a data URL, or a canvas / image already in hand) on the device. */
export async function readStill(src: string | HTMLCanvasElement | HTMLImageElement, settings: AuditSettings): Promise<StillRead> {
  const el = typeof src === "string" ? await loadImage(src) : src;
  const raw = await detectStill(el).catch(() => []);
  const { dets, lamps } = await verifyStill(el, raw).catch(() => ({ dets: raw, lamps: [] }));
  // A still can afford a finer read than live video: far downlights are a few pixels at 256.
  const px = new FrameReader(640).read(el);
  const scene = px ? readScene(px.data, px.w, px.h, px.rgba) : null;
  if (scene && px && lamps.length) {
    scene.lights = withLamps(scene.lights, lamps.map((box) => ({ box, confidence: 0.7 })), px);
    if (scene.lights.length) scene.lighting = "on";
  }
  const items = readItems(dets, scene?.lights ?? [], settings, px ?? undefined);
  return { items, scene };
}
