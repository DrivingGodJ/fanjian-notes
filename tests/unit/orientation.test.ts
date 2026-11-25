import { describe, it, expect } from 'vitest';
import { extractOrientationTiles, scoreOrientation } from '../../src/image-processing/orientation';

describe('4-way OCR text orientation detection', () => {
  it('picks the correct upright rotation across real-world observed score signatures', () => {
    // Upright vertical book (IMG_2310 signature: strong 0 and 270)
    expect(scoreOrientation([3.83, 0, 0, 10.79]).degrees).toBe(0);
    // 90° CW tilted input needs 270° (3 turns)
    expect(scoreOrientation([0, 0, 6.19, 5.12]).degrees).toBe(270);
    // 180° upside-down input needs 180° (2 turns)
    expect(scoreOrientation([0, 11.66, 5.42, 0]).degrees).toBe(180);
    // 270° CW tilted input needs 90° (1 turn), even when only 90° fires
    expect(scoreOrientation([0, 2.15, 0, 0]).degrees).toBe(90);
    // Horizontal text upright
    expect(scoreOrientation([14.43, 0, 0, 9.38]).degrees).toBe(0);
    // Horizontal text 180° upside down
    expect(scoreOrientation([0, 15.9, 15.71, 0]).degrees).toBe(180);
  });

  it('does not rotate blank or low-confidence images', () => {
    const r = scoreOrientation([0.2, 0, 0, 0.1]);
    expect(r.turns).toBe(0);
    expect(r.confidence).toBe(0);
  });

  it('extracts character-sized tiles from multi-line grayscale text', () => {
    const w = 320, h = 420;
    const gray = new Uint8Array(w * h).fill(238);
    // Paint 4 vertical columns of square glyph-like blocks inside central region
    for (const cx of [80, 130, 180, 230]) {
      for (let cy = 80; cy <= 330; cy += 30) {
        for (let dy = -9; dy <= 9; dy++) {
          for (let dx = -9; dx <= 9; dx++) {
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5 || (dx === 0 && Math.abs(dy) < 5)) {
              gray[(cy + dy) * w + (cx + dx)] = 28;
            }
          }
        }
      }
    }
    const tiles = extractOrientationTiles(gray, w, h, 960, 1260, 16);
    expect(tiles.length).toBeGreaterThanOrEqual(3);
    expect(tiles.length).toBeLessThanOrEqual(16);
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.x + t.size).toBeLessThanOrEqual(960);
      expect(t.y + t.size).toBeLessThanOrEqual(1260);
    }
  });
});
