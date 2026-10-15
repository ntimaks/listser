"use client";

import { useEffect } from "react";
import { BODY, EYES_SHUT, type Rect } from "./Pixl";

// Plays Pixl's idle loop in the browser tab: the same hop (pixl-hop, 2.4s) and
// blink (pixl-blink, 4.8s) as the in-app mascot, by swapping the icon links'
// href. Chrome, Edge and Firefox redraw on each swap; Safari keeps the static
// icon.svg. Background tabs throttle timers, so frames there land late but in
// order. Off under prefers-reduced-motion.

// Same 32-unit grid as src/app/icon.svg: Pixl at 2x, 7 units each side.
function frame(hop: boolean, shut: boolean) {
  const rects = shut ? [...BODY, ...EYES_SHUT] : BODY;
  const body = rects
    .map(
      ([x, y, w, h]: Rect) =>
        `<rect x="${x * 2 + 5}" y="${y * 2 + (hop ? 2 : 4)}" width="${w * 2}" height="${h * 2}"/>`
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges"><rect width="32" height="32" fill="#0A0E0A"/><g fill="#C8FF1F">${body}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const LOOP_MS = 4800;

// One 4.8s loop: two hops at 86–94% of each 2.4s cycle, and the eyes shut at
// 93–95% of the loop, which falls inside the second hop.
const STEPS: { at: number; hop: boolean; shut: boolean }[] = [
  { at: 0, hop: false, shut: false },
  { at: 2064, hop: true, shut: false },
  { at: 2256, hop: false, shut: false },
  { at: 4464, hop: true, shut: true },
  { at: 4560, hop: true, shut: false },
  { at: 4656, hop: false, shut: false },
];

export default function AnimatedFavicon() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const frames = STEPS.map((s) => frame(s.hop, s.shut));
    // Looked up on every frame: React may still be hydrating the metadata
    // links when this mounts, and a client navigation can re-render them.
    const links = () =>
      Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'));
    const show = (n: number) => {
      for (const l of links()) {
        l.dataset.staticHref ??= l.getAttribute("href") ?? "";
        l.dataset.staticType ??= l.type;
        l.type = "image/svg+xml";
        l.href = frames[n];
      }
    };

    // Frame 0 looks the same as the static icon, so the first swap waits for
    // the first hop. That leaves the links alone until hydration is done.
    let i = 1;
    let timer = window.setTimeout(function tick() {
      show(i);
      const next = (i + 1) % STEPS.length;
      const wait = (next === 0 ? LOOP_MS : STEPS[next].at) - STEPS[i].at;
      i = next;
      timer = window.setTimeout(tick, wait);
    }, STEPS[1].at);

    return () => {
      window.clearTimeout(timer);
      for (const l of links()) {
        if (l.dataset.staticHref === undefined) continue;
        l.href = l.dataset.staticHref;
        l.type = l.dataset.staticType ?? "";
        delete l.dataset.staticHref;
        delete l.dataset.staticType;
      }
    };
  }, []);
  return null;
}
