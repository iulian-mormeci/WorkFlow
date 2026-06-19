/**
 * Pure-JS document corner detection.
 * Downscales the image, runs a Sobel edge detector, then finds the four extreme
 * edge points nearest each corner quadrant.  Works offline, no WASM required.
 * Accuracy is ~70–80% for typical document-on-desk photos.
 */

const SCALE_W = 400; // downscale target (px)

function toGrayscale(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const b = i * 4;
    g[i] = 0.299 * data[b]! + 0.587 * data[b + 1]! + 0.114 * data[b + 2]!;
  }
  return g;
}

/** Sobel edge magnitude (normalized 0-255). */
function sobelMagnitude(g: Float32Array, w: number, h: number): Float32Array {
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = g[(y - 1) * w + x - 1]!;
      const tm = g[(y - 1) * w + x]!;
      const tr = g[(y - 1) * w + x + 1]!;
      const ml = g[y * w + x - 1]!;
      const mr = g[y * w + x + 1]!;
      const bl = g[(y + 1) * w + x - 1]!;
      const bm = g[(y + 1) * w + x]!;
      const br = g[(y + 1) * w + x + 1]!;
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tm - tr + bl + 2 * bm + br;
      mag[y * w + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return mag;
}

/** Score for the NW / NE / SW / SE quadrant: favour points near the quadrant corner. */
function quadrantScore(
  x: number,
  y: number,
  w: number,
  h: number,
  corner: "tl" | "tr" | "bl" | "br"
): number {
  const cx = corner === "tl" || corner === "bl" ? 0 : w;
  const cy = corner === "tl" || corner === "tr" ? 0 : h;
  // Inverse distance (closer to corner = higher score)
  const dist = Math.hypot(x - cx, y - cy) + 1;
  return 1 / dist;
}

export type DetectedQuad = {
  tl: [number, number];
  tr: [number, number];
  br: [number, number];
  bl: [number, number];
};

const INSET = 0.08; // default inset when detection fails

function defaultQuad(w: number, h: number): DetectedQuad {
  return {
    tl: [w * INSET, h * INSET],
    tr: [w * (1 - INSET), h * INSET],
    br: [w * (1 - INSET), h * (1 - INSET)],
    bl: [w * INSET, h * (1 - INSET)],
  };
}

/**
 * Detect the four corners of a document in the image.
 * Returns pixel coordinates in the original image space.
 */
export function detectDocumentCorners(
  src: HTMLImageElement | HTMLCanvasElement,
  origW: number,
  origH: number
): DetectedQuad {
  try {
    // Downscale
    const scale = SCALE_W / origW;
    const sw = Math.round(origW * scale);
    const sh = Math.round(origH * scale);

    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = sw;
    tmpCanvas.height = sh;
    const ctx = tmpCanvas.getContext("2d")!;
    ctx.drawImage(src, 0, 0, sw, sh);
    const { data } = ctx.getImageData(0, 0, sw, sh);

    const gray = toGrayscale(data, sw, sh);
    const mag = sobelMagnitude(gray, sw, sh);

    // Threshold at 40% of max magnitude
    const max = mag.reduce((m, v) => Math.max(m, v), 0);
    const thresh = max * 0.4;

    // Edge point lists per quadrant sector
    const best: Record<"tl" | "tr" | "bl" | "br", { x: number; y: number; score: number }> = {
      tl: { x: sw * INSET, y: sh * INSET, score: -1 },
      tr: { x: sw * (1 - INSET), y: sh * INSET, score: -1 },
      br: { x: sw * (1 - INSET), y: sh * (1 - INSET), score: -1 },
      bl: { x: sw * INSET, y: sh * (1 - INSET), score: -1 },
    };

    const midX = sw / 2;
    const midY = sh / 2;
    const cornerKeys: (keyof typeof best)[] = ["tl", "tr", "bl", "br"];

    for (let y = 1; y < sh - 1; y++) {
      for (let x = 1; x < sw - 1; x++) {
        if (mag[y * sw + x]! < thresh) continue;

        // Assign to the quadrant this pixel belongs to
        const corner: keyof typeof best = x < midX
          ? (y < midY ? "tl" : "bl")
          : (y < midY ? "tr" : "br");

        const score = mag[y * sw + x]! * quadrantScore(x, y, sw, sh, corner);
        if (score > best[corner].score) {
          best[corner] = { x, y, score };
        }
      }
    }

    // Check if we found real corners (score > -1 means an edge pixel was found)
    const found = cornerKeys.every((k) => best[k].score > 0);
    if (!found) return defaultQuad(origW, origH);

    // Scale back to original image coordinates
    const invScale = 1 / scale;
    return {
      tl: [best.tl.x * invScale, best.tl.y * invScale],
      tr: [best.tr.x * invScale, best.tr.y * invScale],
      br: [best.br.x * invScale, best.br.y * invScale],
      bl: [best.bl.x * invScale, best.bl.y * invScale],
    };
  } catch {
    return defaultQuad(origW, origH);
  }
}
