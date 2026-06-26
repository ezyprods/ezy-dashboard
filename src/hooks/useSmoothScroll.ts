import { useEffect, RefObject } from 'react';

export function useSmoothScroll(ref: RefObject<HTMLElement | null>, deps: any[] = []) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let targetY = el.scrollTop;
    let currentY = el.scrollTop;
    let animationFrameId: number;
    let isAnimating = false;
    let lastTime = performance.now();

    const handleWheel = (e: WheelEvent) => {
      // Allow native scrolling for horizontal, zooming, or trackpads (deltaY usually small like < 20 for trackpads)
      if (e.ctrlKey || e.shiftKey || Math.abs(e.deltaY) < 30) {
        return;
      }

      e.preventDefault();

      const maxScroll = el.scrollHeight - el.clientHeight;
      // We dampen the native wheel delta slightly (e.g., standard deltaY is ~100-120 per notch)
      targetY += e.deltaY * 0.8;
      targetY = Math.max(0, Math.min(targetY, maxScroll));

      if (!isAnimating) {
        isAnimating = true;
        currentY = el.scrollTop;
        lastTime = performance.now();
        animate();
      }
    };

    const animate = () => {
      if (!el) {
        isAnimating = false;
        return;
      }

      const diff = targetY - currentY;

      // When close enough, stop animating
      if (Math.abs(diff) < 0.5) {
        el.scrollTop = targetY;
        isAnimating = false;
        return;
      }

      // Smooth interpolation independent of frame rate
      // 0.15 was originally frame-based, assuming 60fps (~16.6ms).
      // We can use a time delta to adjust the multiplier.
      const now = performance.now();
      const delta = Math.min(now - lastTime, 32); // cap at 32ms to avoid huge jumps
      lastTime = now;

      // Factor adjusted for 60fps baseline (16.6ms)
      const factor = 1 - Math.pow(1 - 0.15, delta / 16.66);
      
      currentY += diff * factor;
      
      // Update DOM
      el.scrollTop = currentY;

      // If the browser natively clamped it because scrollHeight shrank, sync our variables
      if (Math.abs(el.scrollTop - currentY) > 1) {
        currentY = el.scrollTop;
        targetY = currentY;
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    // Add event listener as non-passive to allow e.preventDefault()
    el.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      el.removeEventListener('wheel', handleWheel);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [ref, ...deps]);
}
