/**
 * Pure-JS perspective warp (no external libs, works offline-first).
 * Computes a homography from 4 source→dest point pairs and applies it
 * to an image via canvas bilinear-interpolated inverse mapping.
 */

/** Solve an (n×n) system Ax = b using partial-pivot Gaussian elimination. */
function gaussElim(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);

  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row]![col]!) > Math.abs(M[maxRow]![col]!)) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow]!, M[col]!];

    const pivot = M[col]![col]!;
    if (Math.abs(pivot) < 1e-12) continue;
    for (let row = col + 1; row < n; row++) {
      const factor = M[row]![col]! / pivot;
      for (let k = col; k <= n; k++) M[row]![k]! -= factor * M[col]![k]!;
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    x[row] = M[row]![n]!;
    for (let col = row + 1; col < n; col++) x[row] -= M[row]![col]! * x[col]!;
    x[row] /= M[row]![row]!;
  }
  return x;
}

/**
 * Compute the 3×3 homography matrix (row-major, last element = 1) that maps
 * each src[i] point to the corresponding dst[i] point.
 * Requires exactly 4 point correspondences.
 */
export function computeHomography(
  src: readonly [number, number][],
  dst: readonly [number, number][]
): number[] {
  // Build 8×8 system from the 4 point pairs (2 equations each)
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [sx, sy] = src[i]!;
    const [dx, dy] = dst[i]!;
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }
  const h = gaussElim(A, b);
  return [...h, 1]; // 9-element row-major 3×3 with h[8]=1
}

/** Apply a homography to a point. */
export function applyH(H: number[], x: number, y: number): [number, number] {
  const w = H[6]! * x + H[7]! * y + H[8]!;
  return [(H[0]! * x + H[1]! * y + H[2]!) / w, (H[3]! * x + H[4]! * y + H[5]!) / w];
}

export type Quad = {
  tl: [number, number];
  tr: [number, number];
  br: [number, number];
  bl: [number, number];
};

/**
 * Warp the region defined by `quad` (pixel coords in the source image) into a
 * rectangle and return it as a JPEG data URL.
 * Output is capped at 2000 px on the longer side to keep the operation fast.
 */
export async function warpQuadToDataUrl(
  src: HTMLImageElement | HTMLCanvasElement,
  quad: Quad,
  quality = 0.92
): Promise<string> {
  // Determine output size from quad geometry (average of opposite edges)
  const dist = (a: [number, number], b: [number, number]) =>
    Math.hypot(b[0] - a[0], b[1] - a[1]);

  const rawW = Math.round((dist(quad.tl, quad.tr) + dist(quad.bl, quad.br)) / 2);
  const rawH = Math.round((dist(quad.tl, quad.bl) + dist(quad.tr, quad.br)) / 2);

  const MAX = 2000;
  const scale = Math.min(1, MAX / Math.max(rawW, rawH));
  const outW = Math.max(1, Math.round(rawW * scale));
  const outH = Math.max(1, Math.round(rawH * scale));

  // Source corners → destination rectangle corners
  const srcPts: [number, number][] = [quad.tl, quad.tr, quad.br, quad.bl];
  const dstPts: [number, number][] = [
    [0, 0],
    [outW, 0],
    [outW, outH],
    [0, outH],
  ];

  // Inverse homography (dst → src) for inverse mapping
  const H_inv = computeHomography(dstPts, srcPts);

  // Draw source to an off-screen canvas to read pixel data
  const srcCanvas = document.createElement("canvas");
  const srcW = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
  const srcH = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  srcCanvas.getContext("2d")!.drawImage(src, 0, 0);
  const srcData = srcCanvas.getContext("2d")!.getImageData(0, 0, srcW, srcH).data;

  // Output canvas
  const dstCanvas = document.createElement("canvas");
  dstCanvas.width = outW;
  dstCanvas.height = outH;
  const dstCtx = dstCanvas.getContext("2d")!;
  const dstImage = dstCtx.createImageData(outW, outH);
  const dstData = dstImage.data;

  // Inverse warp: for each dst pixel find src pixel, bilinear interpolate
  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      const [sx, sy] = applyH(H_inv, dx, dy);
      const ix = Math.floor(sx);
      const iy = Math.floor(sy);
      if (ix < 0 || ix >= srcW - 1 || iy < 0 || iy >= srcH - 1) continue;
      const fx = sx - ix;
      const fy = sy - iy;
      const base = (dy * outW + dx) * 4;
      for (let c = 0; c < 4; c++) {
        const s00 = srcData[(iy * srcW + ix) * 4 + c]!;
        const s10 = srcData[(iy * srcW + ix + 1) * 4 + c]!;
        const s01 = srcData[((iy + 1) * srcW + ix) * 4 + c]!;
        const s11 = srcData[((iy + 1) * srcW + ix + 1) * 4 + c]!;
        dstData[base + c] =
          s00 * (1 - fx) * (1 - fy) +
          s10 * fx * (1 - fy) +
          s01 * (1 - fx) * fy +
          s11 * fx * fy;
      }
    }
  }

  dstCtx.putImageData(dstImage, 0, 0);
  return dstCanvas.toDataURL("image/jpeg", quality);
}
