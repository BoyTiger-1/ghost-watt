"use client";

// Browser-side media plumbing for the scanner: grabbing frames, reading their
// pixels, collecting a video's keyframes, and drawing findings onto a picture.

import { SIG_H, SIG_W, frameSignature, sigDiff } from "./live";
import { readExif, type PhotoMeta } from "./exif";
import { SCENE_DIFF, sampleTimes, selectKeyframes, type FrameSample } from "./keyframes";
import { sharpness, toLuma } from "./scene";
import type { LiveItem } from "./ondevice";

type Drawable = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

export function sizeOf(el: Drawable): { w: number; h: number } {
  if (el instanceof HTMLVideoElement) return { w: el.videoWidth, h: el.videoHeight };
  if (el instanceof HTMLImageElement) return { w: el.naturalWidth, h: el.naturalHeight };
  return { w: el.width, h: el.height };
}

/** The element drawn onto a fresh canvas, longest side at most maxDim. */
export function toCanvas(el: Drawable, maxDim: number): HTMLCanvasElement | null {
  const { w, h } = sizeOf(el);
  if (!w || !h) return null;
  const s = Math.min(1, maxDim / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(el, 0, 0, c.width, c.height);
  return c;
}

export function toJpeg(el: Drawable, maxDim: number, quality = 0.8): string | null {
  return toCanvas(el, maxDim)?.toDataURL("image/jpeg", quality) ?? null;
}

/** Reusable small canvases, so a 30 fps loop does not allocate one per frame. */
export class PixelReader {
  private c = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D | null;
  constructor(readonly w: number, readonly h: number) {
    this.c.width = w;
    this.c.height = h;
    this.ctx = this.c.getContext("2d", { willReadFrequently: true });
  }
  rgba(el: Drawable): Uint8ClampedArray | null {
    if (!this.ctx) return null;
    this.ctx.drawImage(el, 0, 0, this.w, this.h);
    return this.ctx.getImageData(0, 0, this.w, this.h).data;
  }
  luma(el: Drawable): { data: Uint8Array; w: number; h: number } | null {
    const px = this.rgba(el);
    return px ? { data: toLuma(px, this.w, this.h), w: this.w, h: this.h } : null;
  }
}

// ---- keyframes -------------------------------------------------------------

interface Scene {
  anchor: Float32Array;
  best: FrameSample & { dataUrl: string };
}

export interface Keyframe {
  t: number;
  dataUrl: string;
}

/**
 * Collects a walkthrough's best frames as they go past, without keeping them all.
 *
 * Each scene keeps only its sharpest frame as a JPEG, so a minute of video costs
 * a couple of dozen small images in memory, not eighteen hundred frames. This
 * runs live while recording - which matters, because a MediaRecorder WebM often
 * has no duration and cannot be seeked afterwards.
 */
export class KeyframeCollector {
  private scenes: Scene[] = [];
  private sigReader = new PixelReader(SIG_W, SIG_H);
  private sharpReader = new PixelReader(160, 120);

  constructor(private readonly maxDim = 768, private readonly maxScenes = 30) {}

  push(el: Drawable, t: number) {
    const px = this.sigReader.rgba(el);
    const l = this.sharpReader.luma(el);
    if (!px || !l) return;
    const sig = frameSignature(px);
    const sharp = sharpness(l.data, l.w, l.h);
    const cur = this.scenes[this.scenes.length - 1];
    if (!cur || sigDiff(cur.anchor, sig) > SCENE_DIFF) {
      const dataUrl = toJpeg(el, this.maxDim, 0.72);
      if (!dataUrl) return;
      if (this.scenes.length >= this.maxScenes) this.dropMostRedundant();
      this.scenes.push({ anchor: sig, best: { t, sig, sharp, dataUrl } });
    } else if (sharp > cur.best.sharp * 1.15) {
      const dataUrl = toJpeg(el, this.maxDim, 0.72);
      if (dataUrl) cur.best = { t, sig, sharp, dataUrl };
    }
  }

  get count() {
    return this.scenes.length;
  }

  /** The scene closest to its predecessor adds least; it goes first. */
  private dropMostRedundant() {
    let worst = 1;
    let worstD = Infinity;
    for (let i = 1; i < this.scenes.length; i++) {
      const d = sigDiff(this.scenes[i - 1].best.sig, this.scenes[i].best.sig);
      if (d < worstD) {
        worstD = d;
        worst = i;
      }
    }
    this.scenes.splice(worst, 1);
  }

  finish(max = 6): Keyframe[] {
    const bests = this.scenes.map((s) => s.best);
    // Scenes are already distinct; selection here only caps the count.
    return selectKeyframes(bests, max, 0).map((i) => ({ t: bests[i].t, dataUrl: bests[i].dataUrl }));
  }
}

/** Keyframes from a video file, by seeking through it. */
export async function videoFileKeyframes(
  url: string,
  onProgress?: (fraction: number) => void,
  max = 6,
): Promise<{ keyframes: Keyframe[]; duration: number; width: number; height: number }> {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  await new Promise<void>((resolve, reject) => {
    v.onloadeddata = () => resolve();
    v.onerror = () => reject(new Error("This video format can't be read by the browser. Try an MP4."));
  });
  const duration = Number.isFinite(v.duration) ? v.duration : 0;
  const collector = new KeyframeCollector();
  const times = sampleTimes(duration, 0.5, 48);
  for (const [i, t] of times.entries()) {
    await seek(v, t);
    collector.push(v, t);
    onProgress?.((i + 1) / times.length);
  }
  const out = { keyframes: collector.finish(max), duration, width: v.videoWidth, height: v.videoHeight };
  v.removeAttribute("src");
  v.load();
  return out;
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      v.removeEventListener("seeked", done);
      resolve();
    };
    v.addEventListener("seeked", done);
    // A seek that never fires (a broken file) must not hang the scan.
    setTimeout(done, 1500);
    v.currentTime = t;
  });
}

// ---- files ---------------------------------------------------------------

export interface IntakeFile {
  kind: "photo" | "video";
  name: string;
  /** Display image: the photo itself, or a video's first keyframe. Null until a video is read. */
  dataUrl: string | null;
  videoUrl?: string;
  meta: PhotoMeta & { bytes: number; width?: number; height?: number; type: string };
}

/** A picked file, read into what the scanner needs: an image, and what the file knows. */
export async function readPhotoFile(file: File, maxDim = 1280): Promise<IntakeFile> {
  const buffer = await file.arrayBuffer();
  const exif = readExif(buffer);
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    throw new Error(
      /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
        ? "HEIC photos can't be opened in this browser. Share it as a JPEG (Most Compatible) instead."
        : "That image couldn't be read.",
    );
  }
  const s = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bitmap.width * s));
  c.height = Math.max(1, Math.round(bitmap.height * s));
  c.getContext("2d")?.drawImage(bitmap, 0, 0, c.width, c.height);
  const meta = { ...exif, bytes: file.size, width: bitmap.width, height: bitmap.height, type: file.type };
  bitmap.close?.();
  return { kind: "photo", name: baseName(file.name), dataUrl: c.toDataURL("image/jpeg", 0.85), meta };
}

export function baseName(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, "").slice(0, 40) || "Upload";
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = src;
  });
}

/** The best recording format this browser offers. Safari only does MP4. */
export function recorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"]) {
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return undefined;
}

// ---- drawing -------------------------------------------------------------

export const ITEM_COLOR = {
  on: "#ff6a5c",
  standby: "#ffb24d",
  light: "#ffd84d",
  person: "#2fe6cf",
  other: "#9aa3b2",
} as const;

export function itemColor(it: Pick<LiveItem, "kind" | "state">): string {
  if (it.kind === "light") return ITEM_COLOR.light;
  if (it.kind === "person") return ITEM_COLOR.person;
  if (it.kind === "other" || !it.state) return ITEM_COLOR.other;
  return it.state === "standby" ? ITEM_COLOR.standby : ITEM_COLOR.on;
}

/** Bake on-device findings into a copy of a frame, for a video's keyframe strip. */
export async function annotateFrame(dataUrl: string, items: readonly LiveItem[]): Promise<string> {
  const img = await loadImage(dataUrl);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0);
  const lw = Math.max(2, Math.round(W / 320));
  const font = Math.max(11, Math.round(W / 55));
  ctx.font = `bold ${font}px ui-monospace, monospace`;
  ctx.textBaseline = "top";
  for (const it of items) {
    if (it.kind === "other") continue;
    const color = itemColor(it);
    const [x1, y1, x2, y2] = it.box;
    const x = x1 * W, y = y1 * H, w = (x2 - x1) * W, h = (y2 - y1) * H;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.setLineDash(it.kind === "light" ? [lw * 2, lw * 2] : []);
    ctx.strokeRect(x, y, w, h);
    const text = it.kind === "person" ? "person" : `${it.label}${it.state === "standby" ? " · dark" : ""}`;
    const tw = ctx.measureText(text).width + 8;
    const th = font + 6;
    const ty = y - th < 0 ? y + h : y - th;
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.fillRect(x - lw / 2, ty, tw, th);
    ctx.fillStyle = "#05070a";
    ctx.fillText(text, x + 4 - lw / 2, ty + 3);
  }
  return c.toDataURL("image/jpeg", 0.8);
}
