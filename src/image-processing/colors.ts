import type { Annotation } from '../types';
import { resizedCanvas } from './images';

interface SamplePixel {
  r: number;
  g: number;
  b: number;
  l: number;
}

const lum = (r: number, g: number, b: number) => r * 0.299 + g * 0.587 + b * 0.114;

function medianRgb(slice: SamplePixel[]): [number, number, number] {
  if (!slice.length) return [255, 253, 244];
  const rs = slice.map(p => p.r).sort((a, b) => a - b);
  const gs = slice.map(p => p.g).sort((a, b) => a - b);
  const bs = slice.map(p => p.b).sort((a, b) => a - b);
  const mid = Math.floor(slice.length / 2);
  return [rs[mid], gs[mid], bs[mid]];
}

/**
 * Sample paper background and ink foreground colors around a character's natural coordinates.
 * Ensures a contrast safety guard so replaced simplified characters remain crisp and readable.
 */
export function sampleGlyphColors(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  annotation: Pick<Annotation, 'sourcePolygon' | 'center' | 'charWidth' | 'charHeight'>
): { bgColor: string; inkColor: string } {
  let minX: number, maxX: number, minY: number, maxY: number;
  if (annotation.sourcePolygon) {
    const xs = annotation.sourcePolygon.map(p => p.x);
    const ys = annotation.sourcePolygon.map(p => p.y);
    minX = Math.min(...xs);
    maxX = Math.max(...xs);
    minY = Math.min(...ys);
    maxY = Math.max(...ys);
  } else {
    minX = annotation.center.x - annotation.charWidth / 2;
    maxX = annotation.center.x + annotation.charWidth / 2;
    minY = annotation.center.y - annotation.charHeight / 2;
    maxY = annotation.center.y + annotation.charHeight / 2;
  }

  const ix0 = Math.max(0, Math.floor(minX));
  const ix1 = Math.min(width - 1, Math.ceil(maxX));
  const iy0 = Math.max(0, Math.floor(minY));
  const iy1 = Math.min(height - 1, Math.ceil(maxY));

  const boxW = Math.max(1, ix1 - ix0);
  const boxH = Math.max(1, iy1 - iy0);
  const pad = Math.max(2, Math.round(Math.min(boxW, boxH) * 0.22));
  const rx0 = Math.max(0, ix0 - pad);
  const rx1 = Math.min(width - 1, ix1 + pad);
  const ry0 = Math.max(0, iy0 - pad);
  const ry1 = Math.min(height - 1, iy1 + pad);

  const ring: SamplePixel[] = [];
  const inner: SamplePixel[] = [];
  const step = Math.max(1, Math.floor(Math.max(boxW, boxH) / 48));

  for (let y = ry0; y <= ry1; y += step) {
    for (let x = rx0; x <= rx1; x += step) {
      const idx = (y * width + x) * 4;
      const r = rgba[idx], g = rgba[idx + 1], b = rgba[idx + 2];
      const px: SamplePixel = { r, g, b, l: lum(r, g, b) };
      if (x >= ix0 && x <= ix1 && y >= iy0 && y <= iy1) inner.push(px);
      else ring.push(px);
    }
  }

  if (!inner.length) {
    const cx = Math.max(0, Math.min(width - 1, Math.round(annotation.center.x)));
    const cy = Math.max(0, Math.min(height - 1, Math.round(annotation.center.y)));
    const idx = (cy * width + cx) * 4;
    const r = rgba[idx] ?? 24, g = rgba[idx + 1] ?? 26, b = rgba[idx + 2] ?? 24;
    inner.push({ r, g, b, l: lum(r, g, b) });
  }

  ring.sort((a, b) => a.l - b.l);
  inner.sort((a, b) => a.l - b.l);

  const ringMedL = ring.length ? ring[Math.floor(ring.length * 0.5)].l : inner[Math.floor(inner.length * 0.5)].l;
  const innerP85L = inner[Math.min(inner.length - 1, Math.floor(inner.length * 0.85))].l;
  const isLightBg = !(ringMedL < 95 && innerP85L > ringMedL + 25);

  const bgSource = ring.length >= 6 ? ring : inner;
  const bgStart = Math.floor(bgSource.length * (isLightBg ? 0.55 : 0.15));
  const bgEnd = Math.max(bgStart + 1, Math.ceil(bgSource.length * (isLightBg ? 0.85 : 0.45)));
  const [bgR, bgG, bgB] = medianRgb(bgSource.slice(bgStart, bgEnd));

  const inkStart = Math.floor(inner.length * (isLightBg ? 0.02 : 0.82));
  const inkEnd = Math.max(inkStart + 1, Math.ceil(inner.length * (isLightBg ? 0.18 : 0.98)));
  let [inkR, inkG, inkB] = medianRgb(inner.slice(inkStart, inkEnd));

  const bgL = lum(bgR, bgG, bgB);
  const inkL = lum(inkR, inkG, inkB);
  if (Math.abs(inkL - bgL) < 55) {
    const [tr, tg, tb] = isLightBg ? [31, 36, 32] : [245, 242, 234];
    const targetL = lum(tr, tg, tb);
    const needed = 58 - Math.abs(inkL - bgL);
    const span = Math.abs(targetL - inkL);
    const t = span > 1 ? Math.min(1, needed / span) : 1;
    inkR = Math.round(inkR + (tr - inkR) * t);
    inkG = Math.round(inkG + (tg - inkG) * t);
    inkB = Math.round(inkB + (tb - inkB) * t);
  }

  return {
    bgColor: `rgb(${bgR},${bgG},${bgB})`,
    inkColor: `rgb(${inkR},${inkG},${inkB})`
  };
}

export async function sampleAnnotationsColors(
  blob: Blob,
  width: number,
  height: number,
  annotations: Annotation[]
): Promise<Annotation[]> {
  if (!annotations.length) return annotations;
  const canvas = await resizedCanvas(blob, 1800, 2800000);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    canvas.width = 1;
    return annotations;
  }
  const cw = canvas.width, ch = canvas.height;
  const { data } = ctx.getImageData(0, 0, cw, ch);
  canvas.width = 1;
  const sx = cw / Math.max(1, width), sy = ch / Math.max(1, height);

  return annotations.map(a => {
    const scaled = {
      center: { x: a.center.x * sx, y: a.center.y * sy },
      charWidth: a.charWidth * sx,
      charHeight: a.charHeight * sy,
      sourcePolygon: a.sourcePolygon?.map(p => ({ x: p.x * sx, y: p.y * sy })) as Annotation['sourcePolygon']
    };
    const colors = sampleGlyphColors(data, cw, ch, scaled);
    return { ...a, ...colors };
  });
}
