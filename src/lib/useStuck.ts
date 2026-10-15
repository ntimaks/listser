"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Whether a `sticky top-0` element is currently pinned. Place the returned ref
 * on an empty element right above it: once that marker scrolls out past the
 * top of the viewport, the sticky element is stuck.
 */
export function useStuck<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) =>
      setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0)
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, stuck] as const;
}
