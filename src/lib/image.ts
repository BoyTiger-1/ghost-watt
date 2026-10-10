// Client-side image downscaling. Keeps payloads tiny (fast on 8GB / CPU
// inference) and means the full-res photo never leaves the browser.

export async function downscaleImage(
  file: File,
  maxDim = 768,
  quality = 0.72,
): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    // Fallback: return the raw data URL.
    return await fileToDataUrl(file);
  }

  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return await fileToDataUrl(file);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", quality);
}

export interface AnalysisImage {
  /** 1000 x 1000 JPEG: the photo top-left, grey padding elsewhere. */
  dataUrl: string;
  /** How much of the square is photo, in square pixels. */
  frame: { w: number; h: number };
}

const SQUARE = 1000;

/**
 * The image the vision model actually sees, padded to a square.
 *
 * Models disagree about what a box coordinate means; on a 1000-pixel square the
 * conventions coincide, so boxes come back in one known space. Anchoring the
 * photo top-left keeps the mapping back to it a plain division. lib/boxes.ts
 * has the full story.
 */
export async function analysisSquare(dataUrl: string, quality = 0.72): Promise<AnalysisImage> {
  const img = await loadImage(dataUrl);
  const scale = SQUARE / Math.max(img.naturalWidth, img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = SQUARE;
  canvas.height = SQUARE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { dataUrl, frame: { w: SQUARE, h: SQUARE } };
  // Mid grey: reads as "nothing here" to a model, unlike black (a dark room?)
  // or white (a wall?).
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, SQUARE, SQUARE);
  ctx.drawImage(img, 0, 0, w, h);
  return { dataUrl: canvas.toDataURL("image/jpeg", quality), frame: { w, h } };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = src;
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
