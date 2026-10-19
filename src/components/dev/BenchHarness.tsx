"use client";

// The detector bench: every on-device candidate, on the same pictures.
//
// Pick frames (yours - the kitchen, the office, the bedroom), run, and every
// detector lists what it found, how sure it was and how long it took. The same
// page exposes window.__bench so the comparison can be scripted against a
// labelled set (docs/live-detector-benchmark.md has the one that chose the
// model). Development only. A YOLOv8n ONNX Runtime Web variant was in this list
// while it was being evaluated; it lost, and its code went with it.

import { useEffect, useState } from "react";
import { getDetector, detectStill, verifyStill } from "@/lib/detector";
import { readScene } from "@/lib/scene";
import { FrameReader, loadImage } from "@/lib/media";
import type { FracDetection } from "@/lib/ondevice";

export interface BenchDetection {
  cls: string;
  score: number;
  box: [number, number, number, number];
}
export interface BenchResult {
  image: string;
  width: number;
  height: number;
  models: Record<string, { ms: number; dets: BenchDetection[]; error?: string }>;
  lights: { count: number; boxes: [number, number, number, number][] };
}

type MpOpts = { url: string; name: string; delegate: "CPU" | "GPU" };
const MP_MODELS = "https://storage.googleapis.com/mediapipe-models/object_detector";
const MP: MpOpts[] = [
  { name: "mp-lite0", url: `${MP_MODELS}/efficientdet_lite0/float16/1/efficientdet_lite0.tflite`, delegate: "CPU" },
  { name: "mp-lite2", url: `${MP_MODELS}/efficientdet_lite2/float16/1/efficientdet_lite2.tflite`, delegate: "CPU" },
];

const mpCache = new Map<string, Promise<import("@mediapipe/tasks-vision").ObjectDetector>>();
async function mpDetector(m: MpOpts) {
  const key = `${m.name}-${m.delegate}`;
  if (!mpCache.has(key)) {
    mpCache.set(
      key,
      (async () => {
        const { FilesetResolver, ObjectDetector } = await import("@mediapipe/tasks-vision");
        const fileset = await FilesetResolver.forVisionTasks("/runtimes/mediapipe");
        return ObjectDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: m.url, delegate: m.delegate },
          runningMode: "IMAGE",
          scoreThreshold: 0.2,
          maxResults: 60,
        });
      })(),
    );
  }
  return mpCache.get(key)!;
}

function frac(d: { categories: { categoryName?: string; score?: number }[]; boundingBox?: { originX: number; originY: number; width: number; height: number } }, w: number, h: number): BenchDetection {
  const b = d.boundingBox!;
  return {
    cls: d.categories[0]?.categoryName ?? "",
    score: d.categories[0]?.score ?? 0,
    box: [b.originX / w, b.originY / h, (b.originX + b.width) / w, (b.originY + b.height) / h],
  };
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t0 = performance.now();
  const value = await fn();
  return { ms: performance.now() - t0, value };
}

export async function benchImage(src: string, which: string[] = ["mp-lite0", "mp-lite2", "mp-lite0-tiled"]): Promise<BenchResult> {
  const img = await loadImage(src, { crossOrigin: src.startsWith("http") });
  if (!img.naturalWidth) throw new Error(`${src} loaded with no size`);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const out: BenchResult = { image: src, width: W, height: H, models: {}, lights: { count: 0, boxes: [] } };

  for (const m of MP) {
    if (!which.includes(m.name)) continue;
    try {
      const det = await mpDetector(m);
      // Warm once so the first-run cost does not count against the model.
      det.detect(img);
      const r = await timed(async () => det.detect(img).detections.map((d) => frac(d as never, W, H)));
      out.models[m.name] = { ms: r.ms, dets: r.value };
    } catch (e) {
      out.models[m.name] = { ms: 0, dets: [], error: String(e) };
    }
  }
  if (which.includes("mp-lite0-tiled")) {
    try {
      await getDetector("IMAGE");
      const r = await timed(async () => {
        const raw = await detectStill(img);
        const { dets } = await verifyStill(img, raw);
        return dets as FracDetection[];
      });
      out.models["mp-lite0-tiled"] = { ms: r.ms, dets: r.value.map((d) => ({ cls: d.cls, score: d.score, box: d.box })) };
    } catch (e) {
      out.models["mp-lite0-tiled"] = { ms: 0, dets: [], error: String(e) };
    }
  }
  const px = new FrameReader(640).read(img);
  if (px) {
    const scene = readScene(px.data, px.w, px.h, px.rgba);
    out.lights = { count: scene.lights.length, boxes: scene.lights.map((l) => l.box) };
  }
  return out;
}

declare global {
  interface Window {
    __bench?: { one: typeof benchImage };
  }
}

export function BenchHarness() {
  const [files, setFiles] = useState<string[]>([]);
  const [results, setResults] = useState<BenchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.__bench = { one: benchImage };
  }, []);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const out: BenchResult[] = [];
      for (const f of files) out.push(await benchImage(f));
      setResults(out);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 pb-16 pt-24">
      <h1 className="text-2xl font-semibold text-fog">Detector bench</h1>
      <p className="text-sm text-mist">
        Development only. Add saved frames, run, and compare what each on-device detector finds. Scores are the detector&apos;s own confidence; the
        count is at a 0.2 threshold so you can see what a higher threshold would drop.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles([...(e.target.files ?? [])].map((f) => URL.createObjectURL(f)))}
          className="text-sm"
        />
        <button onClick={run} disabled={busy || !files.length} className="rounded-full bg-fog px-4 py-2 text-sm font-medium text-ink disabled:opacity-50">
          {busy ? "Running…" : `Run on ${files.length} frame${files.length === 1 ? "" : "s"}`}
        </button>
      </div>
      {error && <p className="text-sm text-ember">{error}</p>}
      {results.map((r) => (
        <div key={r.image} className="panel p-4">
          <div className="flex gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.image} alt="" className="h-40 w-auto rounded-lg" />
            <div className="min-w-0 flex-1 text-xs">
              <p className="font-mono text-dim">
                {r.width}×{r.height} · pixel light finder: {r.lights.count} lit fixture{r.lights.count === 1 ? "" : "s"}
              </p>
              <table className="mt-2 w-full">
                <thead>
                  <tr className="text-left text-dim">
                    <th>model</th>
                    <th>ms</th>
                    <th>found (≥0.2)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(r.models).map(([name, m]) => (
                    <tr key={name} className="border-t border-line align-top">
                      <td className="py-1 pr-3 font-mono">{name}</td>
                      <td className="py-1 pr-3 font-mono tabular-nums">{Math.round(m.ms)}</td>
                      <td className="py-1">
                        {m.error ? (
                          <span className="text-ember">{m.error}</span>
                        ) : (
                          m.dets
                            .slice()
                            .sort((a, b) => b.score - a.score)
                            .map((d, i) => (
                              <span key={i} className="mr-2 inline-block">
                                {d.cls} <span className="text-dim">{d.score.toFixed(2)}</span>
                              </span>
                            ))
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
