"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Loader2, ScanSearch, Wand2 } from "lucide-react";
import { detectDocumentCorners } from "@/lib/image/edge-detect";
import { warpQuadToDataUrl, type Quad } from "@/lib/image/perspective-warp";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

/** Corner key type */
type CK = "tl" | "tr" | "br" | "bl";
const CORNER_KEYS: CK[] = ["tl", "tr", "br", "bl"];

/** Normalized (0–1) corner positions. */
type NQuad = Record<CK, { x: number; y: number }>;

const INSET = 0.08;
const DEFAULT_NQUAD: NQuad = {
  tl: { x: INSET, y: INSET },
  tr: { x: 1 - INSET, y: INSET },
  br: { x: 1 - INSET, y: 1 - INSET },
  bl: { x: INSET, y: 1 - INSET },
};

const HANDLE_R = 18; // display radius of corner handle in px

function toPixelQuad(nq: NQuad, W: number, H: number): Quad {
  return {
    tl: [nq.tl.x * W, nq.tl.y * H],
    tr: [nq.tr.x * W, nq.tr.y * H],
    br: [nq.br.x * W, nq.br.y * H],
    bl: [nq.bl.x * W, nq.bl.y * H],
  };
}

function drawOverlay(canvas: HTMLCanvasElement, nq: NQuad, active: CK | null) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: W, height: H } = canvas;
  ctx.clearRect(0, 0, W, H);

  const pts: [number, number][] = [
    [nq.tl.x * W, nq.tl.y * H],
    [nq.tr.x * W, nq.tr.y * H],
    [nq.br.x * W, nq.br.y * H],
    [nq.bl.x * W, nq.bl.y * H],
  ];

  // Draw dark mask outside the quad
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  pts.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fill("evenodd");
  ctx.restore();

  // Quad border
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  pts.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Corner handles
  CORNER_KEYS.forEach((ck, i) => {
    const [cx, cy] = pts[i]!;
    ctx.beginPath();
    ctx.arc(cx, cy, HANDLE_R, 0, Math.PI * 2);
    ctx.fillStyle = ck === active ? "hsl(220,90%,60%)" : "white";
    ctx.fill();
    ctx.strokeStyle = ck === active ? "hsl(220,90%,40%)" : "rgba(0,0,0,0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

type Props = {
  /** The original captured image File. */
  file: File;
  onApply: (warpedDataUrl: string) => void;
  onSkip: () => void;
  onCancel: () => void;
};

export function PerspectiveCropPanel({ file, onApply, onSkip, onCancel }: Props) {
  const t = useTranslations();
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [nq, setNq] = useState<NQuad>(DEFAULT_NQUAD);
  const [detecting, setDetecting] = useState(false);
  const [warping, setWarping] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imgNaturalSize, setImgNaturalSize] = useState({ w: 1, h: 1 });

  const activeCorner = useRef<CK | null>(null);
  const canvasDisplaySize = useRef({ w: 1, h: 1 });

  // Build object URL for the file
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Redraw overlay whenever quad or active corner changes
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawOverlay(canvas, nq, activeCorner.current);
  }, [nq]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Sync canvas size to displayed image size on load and resize
  function syncCanvasSize() {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const { width, height } = img.getBoundingClientRect();
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
    canvasDisplaySize.current = { w: Math.round(width), h: Math.round(height) };
    redraw();
  }

  function onImgLoad() {
    const img = imgRef.current;
    if (!img) return;
    setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    syncCanvasSize();
    // Auto-detect corners right away (pure JS, fast)
    void runDetect(img);
  }

  async function runDetect(img?: HTMLImageElement) {
    const image = img ?? imgRef.current;
    if (!image) return;
    setDetecting(true);
    try {
      const { w, h } = imgNaturalSize.w > 1 ? imgNaturalSize : { w: image.naturalWidth, h: image.naturalHeight };
      const detected = detectDocumentCorners(image, w, h);
      // Convert pixel coords to normalized
      setNq({
        tl: { x: detected.tl[0] / w, y: detected.tl[1] / h },
        tr: { x: detected.tr[0] / w, y: detected.tr[1] / h },
        br: { x: detected.br[0] / w, y: detected.br[1] / h },
        bl: { x: detected.bl[0] / w, y: detected.bl[1] / h },
      });
    } finally {
      setDetecting(false);
    }
  }

  // --- Pointer interaction ---
  function getCanvasPoint(e: PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function findClosestCorner(nx: number, ny: number): CK | null {
    const { w, h } = canvasDisplaySize.current;
    let best: CK | null = null;
    let bestDist = HANDLE_R * 1.8; // tolerance in display px
    for (const ck of CORNER_KEYS) {
      const dx = (nq[ck].x - nx) * w;
      const dy = (nq[ck].y - ny) * h;
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = ck;
      }
    }
    return best;
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const { x, y } = getCanvasPoint(e);
    const corner = findClosestCorner(x, y);
    if (!corner) return;
    activeCorner.current = corner;
    canvasRef.current?.setPointerCapture(e.pointerId);
    redraw();
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!activeCorner.current) return;
    const { x, y } = getCanvasPoint(e);
    const ck = activeCorner.current;
    setNq((prev) => ({
      ...prev,
      [ck]: { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) },
    }));
  }

  function onPointerUp() {
    activeCorner.current = null;
    redraw();
  }

  // Re-sync canvas on container resize
  useEffect(() => {
    const obs = new ResizeObserver(() => syncCanvasSize());
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyWarp() {
    const img = imgRef.current;
    if (!img) return;
    setWarping(true);
    try {
      const { w, h } = imgNaturalSize;
      const quad = toPixelQuad(nq, w, h);
      const dataUrl = await warpQuadToDataUrl(img, quad);
      onApply(dataUrl);
    } finally {
      setWarping(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("scanner.crop.hint")}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-10 touch-manipulation gap-1.5"
          disabled={detecting || !imageUrl}
          onClick={() => void runDetect()}
        >
          {detecting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ScanSearch className="h-4 w-4" />
          )}
          {t("scanner.crop.autoDetect")}
        </Button>
      </div>

      {/* Image + canvas overlay */}
      <div ref={containerRef} className="relative overflow-hidden rounded-2xl border bg-black/80">
        {imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imageUrl}
              alt="scan"
              className="block max-h-[55dvh] w-full object-contain select-none"
              onLoad={onImgLoad}
              draggable={false}
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 touch-none cursor-crosshair"
              style={{ width: "100%", height: "100%" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          </>
        ) : (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{t("scanner.crop.dragHint")}</p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 touch-manipulation"
          onClick={onCancel}
        >
          {t("common.cancel")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="min-h-11 touch-manipulation"
          onClick={onSkip}
        >
          {t("scanner.crop.skip")}
        </Button>
        <Button
          type="button"
          className="min-h-11 touch-manipulation gap-1.5"
          disabled={warping || !imageUrl}
          onClick={() => void applyWarp()}
        >
          {warping ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )}
          {t("scanner.crop.apply")}
        </Button>
      </div>
    </div>
  );
}
