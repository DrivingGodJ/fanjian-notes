import type { Point, PreparedImage } from '../types';
import type { GrayImage } from './analysis';
import { canvasBlob, loadImage, resizedCanvas, type PerspectiveCorrector } from './images';

export type Corners = [Point, Point, Point, Point];

export const DEFAULT_CORNERS: Corners = [
  { x: 0.06, y: 0.06 },
  { x: 0.94, y: 0.06 },
  { x: 0.94, y: 0.94 },
  { x: 0.06, y: 0.94 }
];

export function cloneCorners(corners: Corners): Corners {
  return corners.map(p => ({ x: p.x, y: p.y })) as Corners;
}

export function polygonArea(corners: Corners): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Verify all 4 points are finite, form a strictly convex quadrilateral, and cover a non-trivial area. */
export function isValidQuad(corners: Corners, minArea = 1e-4): boolean {
  if (corners.length !== 4) return false;
  for (const p of corners) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
  }
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4], c = corners[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (sign !== s) return false;
  }
  return polygonArea(corners) >= minArea;
}

/** Compute 3x3 homography mapping src -> dst via 8x8 Gaussian elimination with partial pivoting. */
export function solveHomography(src: Corners, dst: Corners): Float64Array {
  const A: number[][] = Array.from({ length: 8 }, () => new Array(9).fill(0));
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i];
    const r0 = A[2 * i], r1 = A[2 * i + 1];
    r0[0] = x; r0[1] = y; r0[2] = 1; r0[6] = -u * x; r0[7] = -u * y; r0[8] = u;
    r1[3] = x; r1[4] = y; r1[5] = 1; r1[6] = -v * x; r1[7] = -v * y; r1[8] = v;
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
    }
    if (Math.abs(A[pivot][col]) < 1e-12) throw new Error('选区四角不能共线，请重新调整顶点。');
    if (pivot !== col) { const tmp = A[col]; A[col] = A[pivot]; A[pivot] = tmp; }
    const diag = A[col][col];
    for (let j = col; j <= 8; j++) A[col][j] /= diag;
    for (let row = 0; row < 8; row++) {
      if (row === col || A[row][col] === 0) continue;
      const factor = A[row][col];
      for (let j = col; j <= 8; j++) A[row][j] -= factor * A[col][j];
    }
  }
  return new Float64Array([A[0][8], A[1][8], A[2][8], A[3][8], A[4][8], A[5][8], A[6][8], A[7][8], 1]);
}

export function estimateOutputSize(
  corners: Corners,
  maxSide = 2400,
  maxPixels = 5000000
): { width: number; height: number } {
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const topW = dist(corners[0], corners[1]), botW = dist(corners[3], corners[2]);
  const leftH = dist(corners[0], corners[3]), rightH = dist(corners[1], corners[2]);
  const rawW = Math.max(32, Math.round(Math.max(topW, botW) * 0.6 + Math.min(topW, botW) * 0.4));
  const rawH = Math.max(32, Math.round(Math.max(leftH, rightH) * 0.6 + Math.min(leftH, rightH) * 0.4));
  const ratio = Math.min(1, maxSide / Math.max(rawW, rawH), Math.sqrt(maxPixels / (rawW * rawH)));
  return { width: Math.max(1, Math.round(rawW * ratio)), height: Math.max(1, Math.round(rawH * ratio)) };
}

/** Warp src RGBA pixels inside `corners` (pixel coordinates TL, TR, BR, BL) to dstW x dstH using bilinear interpolation. */
export function warpRgbaPerspective(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  corners: Corners,
  dstW: number,
  dstH: number
): Uint8ClampedArray<ArrayBuffer> {
  if (!isValidQuad(corners, 16)) throw new Error('四个角点未构成有效凸四边形，请调整后再应用。');
  const dstCorners: Corners = [
    { x: 0, y: 0 },
    { x: dstW - 1, y: 0 },
    { x: dstW - 1, y: dstH - 1 },
    { x: 0, y: dstH - 1 }
  ];
  const H = solveHomography(dstCorners, corners);
  const h0 = H[0], h1 = H[1], h2 = H[2], h3 = H[3], h4 = H[4], h5 = H[5], h6 = H[6], h7 = H[7], h8 = H[8];
  const out = new Uint8ClampedArray(dstW * dstH * 4);
  const maxX = srcW - 1, maxY = srcH - 1;
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const denom = h6 * x + h7 * y + h8;
      const sx = Math.max(0, Math.min(maxX, (h0 * x + h1 * y + h2) / denom));
      const sy = Math.max(0, Math.min(maxY, (h3 * x + h4 * y + h5) / denom));
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(maxX, x0 + 1), y1 = Math.min(maxY, y0 + 1);
      const fx = sx - x0, fy = sy - y0;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      const i00 = (y0 * srcW + x0) * 4, i10 = (y0 * srcW + x1) * 4;
      const i01 = (y1 * srcW + x0) * 4, i11 = (y1 * srcW + x1) * 4;
      const outIdx = (y * dstW + x) * 4;
      out[outIdx] = Math.round(src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11);
      out[outIdx + 1] = Math.round(src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11);
      out[outIdx + 2] = Math.round(src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11);
      out[outIdx + 3] = Math.round(src[i00 + 3] * w00 + src[i10 + 3] * w10 + src[i01 + 3] * w01 + src[i11 + 3] * w11);
    }
  }
  return out;
}

/** Heuristic page quad detector returning normalized [0..1] clockwise corners. */
export function detectDocumentQuad(image: GrayImage): { corners: Corners; detected: boolean } {
  const { width: w, height: h, data } = image;
  if (w < 24 || h < 24) return { corners: cloneCorners(DEFAULT_CORNERS), detected: false };

  const borderSamples: number[] = [], centerSamples: number[] = [];
  const bw = Math.max(2, Math.floor(w * 0.06)), bh = Math.max(2, Math.floor(h * 0.06));
  const cx0 = Math.floor(w * 0.25), cx1 = Math.ceil(w * 0.75), cy0 = Math.floor(h * 0.25), cy1 = Math.ceil(h * 0.75);
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const v = data[y * w + x];
      if (x < bw || x >= w - bw || y < bh || y >= h - bh) borderSamples.push(v);
      else if (x >= cx0 && x < cx1 && y >= cy0 && y < cy1) centerSamples.push(v);
    }
  }
  borderSamples.sort((a, b) => a - b);
  centerSamples.sort((a, b) => a - b);
  const borderMed = borderSamples[Math.floor(borderSamples.length * 0.5)] ?? 0;
  const centerMed = centerSamples[Math.floor(centerSamples.length * 0.5)] ?? 0;
  if (centerMed - borderMed < 28) return { corners: cloneCorners(DEFAULT_CORNERS), detected: false };

  const threshold = borderMed + (centerMed - borderMed) * 0.45;
  const raw = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++) if (data[i] > threshold) raw[i] = 1;

  // Morphological erosion (3x3) removes isolated specular specks on dark tables.
  const mask = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) count += raw[(y + dy) * w + (x + dx)];
      }
      if (count >= 7) mask[y * w + x] = 1;
    }
  }

  let tl = { x: 0, y: 0 }, tr = { x: w - 1, y: 0 }, br = { x: w - 1, y: h - 1 }, bl = { x: 0, y: h - 1 };
  let minSum = Infinity, maxSum = -Infinity, minDiff = Infinity, maxDiff = -Infinity;
  let fgCount = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!mask[y * w + x]) continue;
      fgCount++;
      const sum = x + y, diff = x - y;
      if (sum < minSum) { minSum = sum; tl = { x, y }; }
      if (sum > maxSum) { maxSum = sum; br = { x, y }; }
      if (diff > maxDiff) { maxDiff = diff; tr = { x, y }; }
      if (diff < minDiff) { minDiff = diff; bl = { x, y }; }
    }
  }

  if (fgCount < w * h * 0.14) return { corners: cloneCorners(DEFAULT_CORNERS), detected: false };
  const normalized: Corners = [
    { x: Math.max(0, Math.min(1, tl.x / (w - 1))), y: Math.max(0, Math.min(1, tl.y / (h - 1))) },
    { x: Math.max(0, Math.min(1, tr.x / (w - 1))), y: Math.max(0, Math.min(1, tr.y / (h - 1))) },
    { x: Math.max(0, Math.min(1, br.x / (w - 1))), y: Math.max(0, Math.min(1, br.y / (h - 1))) },
    { x: Math.max(0, Math.min(1, bl.x / (w - 1))), y: Math.max(0, Math.min(1, bl.y / (h - 1))) }
  ];
  const area = polygonArea(normalized);
  if (!isValidQuad(normalized, 0.16) || area > 0.94) {
    return { corners: cloneCorners(DEFAULT_CORNERS), detected: false };
  }
  return { corners: normalized, detected: true };
}

export async function rectifyPerspective(image: PreparedImage, normalizedCorners: Corners): Promise<PreparedImage> {
  if (!isValidQuad(normalizedCorners, 0.005)) {
    throw new Error('四个角点区域过小或有交叉，请调整后再拉正。');
  }
  const source = await loadImage(image.blob);
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = image.width;
  srcCanvas.height = image.height;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) throw new Error('此浏览器无法创建图像画布。');
  srcCtx.drawImage(source, 0, 0, image.width, image.height);
  const pixels = srcCtx.getImageData(0, 0, image.width, image.height);

  const pxCorners = normalizedCorners.map(p => ({
    x: Math.max(0, Math.min(image.width - 1, p.x * image.width)),
    y: Math.max(0, Math.min(image.height - 1, p.y * image.height))
  })) as Corners;
  const dstSize = estimateOutputSize(pxCorners);
  const warped = warpRgbaPerspective(pixels.data, image.width, image.height, pxCorners, dstSize.width, dstSize.height);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = dstSize.width;
  outCanvas.height = dstSize.height;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) throw new Error('此浏览器无法创建输出画布。');
  outCtx.putImageData(new ImageData(warped, dstSize.width, dstSize.height), 0, 0);
  const blob = await canvasBlob(outCanvas);
  srcCanvas.width = 1;
  outCanvas.width = 1;
  return { ...image, blob, width: dstSize.width, height: dstSize.height };
}

export async function detectImageDocumentQuad(blob: Blob): Promise<{ corners: Corners; detected: boolean }> {
  const canvas = await resizedCanvas(blob, 360, 120000);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { corners: cloneCorners(DEFAULT_CORNERS), detected: false };
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const gray = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = Math.round(data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114);
  }
  const w = canvas.width, h = canvas.height;
  canvas.width = 1;
  return detectDocumentQuad({ data: gray, width: w, height: h });
}

export const perspectiveCorrector: PerspectiveCorrector = {
  async correct(image, corners) {
    if (corners.length !== 4) throw new Error('需要 4 个角点坐标。');
    const maxCoord = Math.max(...corners.flat());
    const normalized = (maxCoord > 1.05
      ? corners.map(([x, y]) => ({ x: x / image.width, y: y / image.height }))
      : corners.map(([x, y]) => ({ x, y }))) as Corners;
    return rectifyPerspective(image, normalized);
  }
};
