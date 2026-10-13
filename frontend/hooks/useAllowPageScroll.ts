"use client";

import { useEffect } from "react";

/**
 * globals.css locks html/body to overflow:hidden for the authenticated app
 * shell (each page manages its own internal scroll region instead). Public
 * marketing pages render as one normal scrollable document, so they need to
 * temporarily lift that lock while mounted.
 */
export function useAllowPageScroll() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      ho: html.style.overflow,
      hh: html.style.height,
      hob: html.style.overscrollBehavior,
      bo: body.style.overflow,
      bh: body.style.height,
      bob: body.style.overscrollBehavior,
    };
    html.style.overflow = "auto";
    html.style.height = "auto";
    // globals.css sets overscroll-behavior: none on html/body for the app
    // shell; left in place it silently blocks wheel-driven scrolling on a
    // normal, unconstrained document like this one, not just scroll-chaining.
    html.style.overscrollBehavior = "auto";
    body.style.overflow = "auto";
    body.style.height = "auto";
    body.style.overscrollBehavior = "auto";

    // Force a clean reload when the page is restored from the back/forward
    // cache, so pressing Back never shows a stale, half-rendered snapshot.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);

    return () => {
      html.style.overflow = prev.ho;
      html.style.height = prev.hh;
      html.style.overscrollBehavior = prev.hob;
      body.style.overflow = prev.bo;
      body.style.height = prev.bh;
      body.style.overscrollBehavior = prev.bob;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);
}
