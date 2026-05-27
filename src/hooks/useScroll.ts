import { useCallback, useEffect, useRef } from "react";

const BASE_PX_PER_SECOND = 80;

export interface UseScrollOptions {
  speed: number;
  isPlaying: boolean;
}

export function useScroll(
  containerRef: React.RefObject<HTMLElement | null>,
  { speed, isPlaying }: UseScrollOptions,
) {
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const tick = useCallback((timestamp: number) => {
    const container = containerRef.current;
    if (!container) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    if (lastTsRef.current == null) {
      lastTsRef.current = timestamp;
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    const delta = timestamp - lastTsRef.current;
    lastTsRef.current = timestamp;
    const px = (BASE_PX_PER_SECOND * speedRef.current * delta) / 1000;
    container.scrollTop += px;
    rafRef.current = requestAnimationFrame(tick);
  }, [containerRef]);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    };
  }, [isPlaying, tick]);

  const scrollToOffset = useCallback(
    (ratio: number) => {
      const c = containerRef.current;
      if (!c) return;
      c.scrollTop = Math.max(0, Math.min(c.scrollHeight, c.scrollHeight * ratio));
    },
    [containerRef],
  );

  const restart = useCallback(() => {
    const c = containerRef.current;
    if (c) c.scrollTop = 0;
    lastTsRef.current = null;
  }, [containerRef]);

  return { scrollToOffset, restart };
}
