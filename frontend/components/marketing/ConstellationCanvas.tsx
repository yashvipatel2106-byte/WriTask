"use client";

import { useRef } from "react";
import { useConstellation } from "@/hooks/useConstellation";

/**
 * The animated connected-dots background from the auth pages, extracted so
 * other public marketing pages (FAQ, ...) can reuse the same attractive
 * effect without depending on login.css.
 */
export default function ConstellationCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useConstellation(canvasRef);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 block pointer-events-none"
      aria-hidden="true"
    />
  );
}
