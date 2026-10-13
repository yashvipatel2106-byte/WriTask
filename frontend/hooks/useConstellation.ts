"use client";

import { useEffect, type RefObject } from "react";

/** Shared auth-page constellation canvas animation (visuals unchanged). */
export function useConstellation(ref: RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    /* two colour stops to interpolate between */
    const C1 = { r: 124, g: 109, b: 250 }; /* violet */
    const C2 = { r: 45, g: 212, b: 191 }; /* teal   */

    const N = 130,
      LINK = 160;
    const pts = Array.from({ length: N }, (_, i) => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.5,
      a: Math.random() * 0.6 + 0.3,
      t: i / N /* colour lerp position */,
    }));

    let raf: number;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x += canvas.width;
        if (p.x > canvas.width) p.x -= canvas.width;
        if (p.y < 0) p.y += canvas.height;
        if (p.y > canvas.height) p.y -= canvas.height;
      }

      /* links */
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < LINK) {
            const alpha = (1 - d / LINK) * 0.28;
            const t = (pts[i].t + pts[j].t) / 2;
            const r = Math.round(C1.r + (C2.r - C1.r) * t);
            const g = Math.round(C1.g + (C2.g - C1.g) * t);
            const b = Math.round(C1.b + (C2.b - C1.b) * t);
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
        }
      }

      /* dots */
      for (const p of pts) {
        const r2 = Math.round(C1.r + (C2.r - C1.r) * p.t);
        const g2 = Math.round(C1.g + (C2.g - C1.g) * p.t);
        const b2 = Math.round(C1.b + (C2.b - C1.b) * p.t);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r2},${g2},${b2},${p.a})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [ref]);
}
