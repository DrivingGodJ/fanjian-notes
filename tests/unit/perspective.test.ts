import { describe, it, expect } from 'vitest';
import {
  detectDocumentQuad,
  isValidQuad,
  solveHomography,
  warpRgbaPerspective,
  type Corners
} from '../../src/image-processing/perspective';
import { enhanceDocumentRgba } from '../../src/image-processing/enhance';

describe('4-corner perspective rectification', () => {
  it('validates convex quads and rejects bowtie or collinear quads', () => {
    expect(isValidQuad([
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 }
    ])).toBe(true);
    // Bowtie self-intersecting quad
    expect(isValidQuad([
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.9, y: 0.1 },
      { x: 0.1, y: 0.9 }
    ])).toBe(false);
    // Collinear degenerate quad
    expect(isValidQuad([
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 1, y: 0 },
      { x: 0.5, y: 0.5 }
    ])).toBe(false);
  });

  it('rectifies a synthetic trapezoid-warped grid back to square coordinates', () => {
    const srcW = 200, srcH = 200, dstW = 120, dstH = 120;
    const corners: Corners = [
      { x: 40, y: 20 },
      { x: 160, y: 30 },
      { x: 185, y: 175 },
      { x: 15, y: 165 }
    ];
    const dstRect: Corners = [
      { x: 0, y: 0 },
      { x: dstW - 1, y: 0 },
      { x: dstW - 1, y: dstH - 1 },
      { x: 0, y: dstH - 1 }
    ];
    // Project an interior black cross in dst space into src space via forward homography.
    const H = solveHomography(dstRect, corners);
    const src = new Uint8ClampedArray(srcW * srcH * 4).fill(255);
    for (let y = 0; y < srcH; y++) {
      for (let x = 0; x < srcW; x++) {
        src[(y * srcW + x) * 4 + 3] = 255;
      }
    }
    const paintDstPoint = (u: number, v: number) => {
      const denom = H[6] * u + H[7] * v + H[8];
      const sx = (H[0] * u + H[1] * v + H[2]) / denom;
      const sy = (H[3] * u + H[4] * v + H[5]) / denom;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ix = Math.round(sx + dx), iy = Math.round(sy + dy);
          if (ix >= 0 && ix < srcW && iy >= 0 && iy < srcH) {
            const idx = (iy * srcW + ix) * 4;
            src[idx] = 20; src[idx + 1] = 20; src[idx + 2] = 20;
          }
        }
      }
    };
    for (let i = 10; i < dstW - 10; i++) {
      paintDstPoint(i, dstH / 2);
      paintDstPoint(dstW / 2, i);
    }

    const out = warpRgbaPerspective(src, srcW, srcH, corners, dstW, dstH);
    const centerIdx = (Math.round(dstH / 2) * dstW + Math.round(dstW / 2)) * 4;
    const cornerIdx = (10 * dstW + 10) * 4;
    expect(out[centerIdx]).toBeLessThan(60);
    expect(out[cornerIdx]).toBeGreaterThan(220);
  });

  it('detects a tilted light page on a dark table background', () => {
    const w = 180, h = 240, data = new Uint8Array(w * h).fill(25);
    const quad: Corners = [
      { x: 30, y: 24 },
      { x: 152, y: 36 },
      { x: 164, y: 212 },
      { x: 18, y: 198 }
    ];
    // Fill convex polygon interior with bright paper value
    const inside = (x: number, y: number) => {
      for (let i = 0; i < 4; i++) {
        const a = quad[i], b = quad[(i + 1) % 4];
        if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false;
      }
      return true;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (inside(x, y)) data[y * w + x] = 228;
      }
    }
    const res = detectDocumentQuad({ data, width: w, height: h });
    expect(res.detected).toBe(true);
    expect(Math.abs(res.corners[0].x - quad[0].x / (w - 1))).toBeLessThan(0.06);
    expect(Math.abs(res.corners[2].y - quad[2].y / (h - 1))).toBeLessThan(0.06);
  });

  it('returns detected=false on a uniform full-bleed page', () => {
    const w = 120, h = 160, data = new Uint8Array(w * h).fill(235);
    const res = detectDocumentQuad({ data, width: w, height: h });
    expect(res.detected).toBe(false);
  });

  it('brightens shadowed regions while preserving dark ink contrast', () => {
    const w = 100, h = 100, rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const bg = x < w / 2 ? 115 : 235;
        const isInk = y >= 46 && y <= 54 && (x === 25 || x === 75);
        const val = isInk ? Math.max(15, bg - 95) : bg;
        rgba[idx] = val; rgba[idx + 1] = val; rgba[idx + 2] = val; rgba[idx + 3] = 255;
      }
    }
    const enhanced = enhanceDocumentRgba(rgba, w, h);
    const shadowBg = enhanced[(20 * w + 20) * 4];
    const litBg = enhanced[(20 * w + 80) * 4];
    const shadowInk = enhanced[(50 * w + 25) * 4];
    expect(shadowBg).toBeGreaterThan(175);
    expect(Math.abs(litBg - shadowBg)).toBeLessThan(70);
    expect(shadowBg - shadowInk).toBeGreaterThan(80);
  });

  it('sharpens soft blurred text edges via luminance unsharp masking', () => {
    const w = 60, h = 60, rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const val = x < 28 ? 230 : x === 28 ? 170 : x === 29 ? 110 : 50;
        rgba[idx] = val; rgba[idx + 1] = val; rgba[idx + 2] = val; rgba[idx + 3] = 255;
      }
    }
    const enhanced = enhanceDocumentRgba(rgba, w, h);
    const beforeStep = rgba[(30 * w + 28) * 4] - rgba[(30 * w + 29) * 4];
    const afterStep = enhanced[(30 * w + 28) * 4] - enhanced[(30 * w + 29) * 4];
    expect(afterStep).toBeGreaterThan(beforeStep);
  });
});
