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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
