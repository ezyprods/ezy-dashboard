import { useEffect, RefObject } from 'react';

export function useSmoothScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let targetY = el.scrollTop;
    let currentY = el.scrollTop;
    let animationFrameId: number;
    let isAnimating = false;

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
        animate();
      }
    };

    const animate = () => {
      if (!el) {
        isAnimating = false;
        return;
      }

      const maxScroll = el.scrollHeight - el.clientHeight;
      targetY = Math.max(0, Math.min(targetY, maxScroll));

      const diff = targetY - currentY;

      // When close enough, stop animating
      if (Math.abs(diff) < 0.5) {
        el.scrollTop = targetY;
        isAnimating = false;
        return;
      }

      // Smooth interpolation (lower = smoother/slower, higher = faster)
      currentY += diff * 0.15;
      el.scrollTop = currentY;

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
  }, [ref]);
}
