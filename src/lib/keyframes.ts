// Picking the frames of a walkthrough video worth sending to the AI.
//
// A 30-second clip is 900 frames, and a vision model takes a handful of images
// per request. Sampling every few seconds wastes the budget on near-duplicates
// while the camera lingers and misses the room it panned past quickly. So frames
// are grouped into scenes - a new scene starts when the view has changed enough
// from the one before - and each scene contributes its sharpest frame, since a
// motion-blurred frame is a frame the model cannot count monitors in.

import { sigDiff } from "./live";

export interface FrameSample {
  /** Seconds into the clip. */
  t: number;
  /** Greyscale thumbnail signature (see live.ts frameSignature). */
  sig: Float32Array;
  /** Laplacian variance; higher is sharper. */
  sharp: number;
}

/** Mean thumbnail change that counts as a new view. */
export const SCENE_DIFF = 18;

/** Indices of the frames to keep, in time order. */
export function selectKeyframes(samples: readonly FrameSample[], max = 6, sceneDiff = SCENE_DIFF): number[] {
  if (!samples.length || max <= 0) return [];

  // 1. Scenes: start a new one when the view drifts far enough from its first frame.
  const scenes: number[][] = [];
  let anchor = samples[0].sig;
  let cur: number[] = [];
  samples.forEach((s, i) => {
    if (cur.length && sigDiff(anchor, s.sig) > sceneDiff) {
      scenes.push(cur);
      cur = [];
      anchor = s.sig;
    }
    cur.push(i);
  });
  if (cur.length) scenes.push(cur);

  // 2. The sharpest frame of each scene.
  let picks = scenes.map((idx) => idx.reduce((best, i) => (samples[i].sharp > samples[best].sharp ? i : best), idx[0]));

  // 3. Too many scenes: keep the most mutually different, farthest-point first,
  //    so a long clip of one corridor does not crowd out the lab at its end.
  if (picks.length > max) {
    const chosen = [picks[0]];
    const rest = new Set(picks.slice(1));
    while (chosen.length < max && rest.size) {
      let best = -1;
      let bestD = -1;
      for (const i of rest) {
        const d = Math.min(...chosen.map((c) => sigDiff(samples[c].sig, samples[i].sig)));
        if (d > bestD) {
          bestD = d;
          best = i;
        }
      }
      chosen.push(best);
      rest.delete(best);
    }
    picks = chosen;
  }
  return picks.sort((a, b) => a - b);
}

/** Times to sample a clip of this length at, roughly every `step` seconds, at most `cap`. */
export function sampleTimes(duration: number, step = 0.5, cap = 60): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [0];
  const n = Math.max(1, Math.min(cap, Math.floor(duration / step)));
  const dt = duration / n;
  // Middle of each slot: never exactly 0 (often black) or the very end (often unseekable).
  return Array.from({ length: n }, (_, i) => Math.min(duration - 0.05, (i + 0.5) * dt));
}
