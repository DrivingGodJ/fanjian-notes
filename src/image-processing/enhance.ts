import type { PreparedImage } from '../types';
import { canvasBlob, loadImage } from './images';

/**
 * Normalize uneven shadows, enhance faint ink contrast, and apply luminance-only 3x3 unsharp mask sharpening.
 */
export function enhanceDocumentRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray<ArrayBuffer> {
  const count = width * height;
  if (rgba.length !== count * 4) throw new Error('图像像素尺寸不匹配');
  const lum = new Float32Array(count);
  const integral = new Float64Array((width + 1) * (height + 1));

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      const idx = y * width + x, p = idx * 4;
      const l = rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114;
      lum[idx] = l;
      rowSum += l;
      integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + rowSum;
    }
  }

  const r = Math.max(18, Math.round(Math.min(width, height) / 14));
  const mid = new Uint8ClampedArray(count * 4);
  const midLum = new Float32Array(count);

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(height, y + r + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(width, x + r + 1);
      const area = (x1 - x0) * (y1 - y0);
      const localMean = (
        integral[y1 * (width + 1) + x1]
        - integral[y0 * (width + 1) + x1]
        - integral[y1 * (width + 1) + x0]
        + integral[y0 * (width + 1) + x0]
      ) / area;
      const bg = Math.max(localMean * 1.08, 60);
      const rawGain = Math.min(1.85, Math.max(0.85, 240 / Math.max(bg, 65)));
      let gain = 0.72 * rawGain + 0.28;
      const idx = y * width + x, l = lum[idx];
      if (l < bg - 15) gain *= 0.88;
      const p = idx * 4;
      const nr = Math.min(255, Math.max(0, Math.round(rgba[p] * gain)));
      const ng = Math.min(255, Math.max(0, Math.round(rgba[p + 1] * gain)));
      const nb = Math.min(255, Math.max(0, Math.round(rgba[p + 2] * gain)));
      mid[p] = nr; mid[p + 1] = ng; mid[p + 2] = nb; mid[p + 3] = rgba[p + 3];
      midLum[idx] = nr * 0.299 + ng * 0.587 + nb * 0.114;
    }
  }

  const out = new Uint8ClampedArray(mid);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const center = midLum[idx];
      const blur = (
        4 * center
        + 2 * (midLum[idx - 1] + midLum[idx + 1] + midLum[idx - width] + midLum[idx + width])
        + (midLum[idx - width - 1] + midLum[idx - width + 1] + midLum[idx + width - 1] + midLum[idx + width + 1])
      ) / 16;
      const diff = center - blur;
      if (Math.abs(diff) <= 3) continue;
      const boost = Math.max(-55, Math.min(55, Math.round(diff * 1.2)));
      const p = idx * 4;
      out[p] = Math.min(255, Math.max(0, mid[p] + boost));
      out[p + 1] = Math.min(255, Math.max(0, mid[p + 1] + boost));
      out[p + 2] = Math.min(255, Math.max(0, mid[p + 2] + boost));
    }
  }
  return out;
}

export async function enhanceDocumentImage(image: PreparedImage): Promise<PreparedImage> {
  const source = await loadImage(image.blob);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('此浏览器无法创建图像画布。');
  ctx.drawImage(source, 0, 0, image.width, image.height);
  const pixels = ctx.getImageData(0, 0, image.width, image.height);
  const enhanced = enhanceDocumentRgba(pixels.data, image.width, image.height);
  ctx.putImageData(new ImageData(enhanced, image.width, image.height), 0, 0);
  const blob = await canvasBlob(canvas);
  canvas.width = 1;
  return { ...image, blob };
}
