import { describe, it, expect } from 'vitest';
import { sampleGlyphColors } from '../../src/image-processing/colors';

function makeImage(
  w: number,
  h: number,
  bg: [number, number, number],
  ink: [number, number, number],
  box: { x0: number; y0: number; x1: number; y1: number }
) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const inCross =
        x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1
        && (Math.abs(x - (box.x0 + box.x1) / 2) <= 2 || Math.abs(y - (box.y0 + box.y1) / 2) <= 2);
      const [r, g, b] = inCross ? ink : bg;
      rgba[idx] = r; rgba[idx + 1] = g; rgba[idx + 2] = b; rgba[idx + 3] = 255;
    }
  }
  return rgba;
}

describe('adaptive glyph color sampling', () => {
  it('samples warm paper background and dark brown ink accurately', () => {
    const rgba = makeImage(80, 80, [242, 232, 208], [59, 42, 30], { x0: 24, y0: 24, x1: 56, y1: 56 });
    const res = sampleGlyphColors(rgba, 80, 80, {
      center: { x: 40, y: 40 },
      charWidth: 32,
      charHeight: 32
    });
    expect(res.bgColor).toBe('rgb(242,232,208)');
    expect(res.inkColor).toBe('rgb(59,42,30)');
  });

  it('samples dark background and light ink accurately', () => {
    const rgba = makeImage(80, 80, [34, 38, 36], [240, 240, 235], { x0: 24, y0: 24, x1: 56, y1: 56 });
    const res = sampleGlyphColors(rgba, 80, 80, {
      center: { x: 40, y: 40 },
      charWidth: 32,
      charHeight: 32
    });
    expect(res.bgColor).toBe('rgb(34,38,36)');
    expect(res.inkColor).toBe('rgb(240,240,235)');
  });

  it('enforces readable contrast when sampled ink is too close to paper background', () => {
    const rgba = makeImage(80, 80, [230, 228, 220], [208, 205, 198], { x0: 24, y0: 24, x1: 56, y1: 56 });
    const res = sampleGlyphColors(rgba, 80, 80, {
      center: { x: 40, y: 40 },
      charWidth: 32,
      charHeight: 32
    });
    const parse = (c: string) => c.match(/\d+/g)!.map(Number);
    const lum = ([r, g, b]: number[]) => r * 0.299 + g * 0.587 + b * 0.114;
    expect(Math.abs(lum(parse(res.bgColor)) - lum(parse(res.inkColor)))).toBeGreaterThanOrEqual(50);
  });
});
