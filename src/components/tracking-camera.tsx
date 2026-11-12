'use client';
import { useEffect, useRef } from 'react';
import Image from 'next/image';

/** Decorative product render. Pointer coordinates never leave this component. */
export function TrackingCamera({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    let targetX = 0,
      targetY = 0,
      x = 0,
      y = 0,
      frame = 0;
    const paint = () => {
      x += (targetX - x) * 0.09;
      y += (targetY - y) * 0.09;
      root.style.setProperty('--camera-x', x.toFixed(4));
      root.style.setProperty('--camera-y', y.toFixed(4));
      if (Math.abs(targetX - x) + Math.abs(targetY - y) > 0.001)
        frame = requestAnimationFrame(paint);
      else frame = 0;
    };
    const move = (event: PointerEvent) => {
      if (
        reduced.matches ||
        !fine.matches ||
        event.pointerType === 'touch' ||
        !root.getClientRects().length
      )
        return;
      const rect = root.getBoundingClientRect();
      targetX = Math.max(
        -1,
        Math.min(1, (event.clientX - (rect.left + rect.width * 0.5)) / (window.innerWidth * 0.55)),
      );
      targetY = Math.max(
        -1,
        Math.min(1, (event.clientY - (rect.top + rect.height * 0.5)) / (window.innerHeight * 0.6)),
      );
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const reset = () => {
      targetX = 0;
      targetY = 0;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const preference = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      targetX = targetY = x = y = 0;
      root.style.setProperty('--camera-x', '0');
      root.style.setProperty('--camera-y', '0');
    };
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', reset);
    window.addEventListener('blur', reset);
    reduced.addEventListener('change', preference);
    fine.addEventListener('change', preference);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', reset);
      window.removeEventListener('blur', reset);
      reduced.removeEventListener('change', preference);
      fine.removeEventListener('change', preference);
    };
  }, []);
  return (
    <div ref={ref} className={`tracking-camera ${className}`} aria-hidden="true">
      <div className="camera-head">
        <Image
          src="/security-camera-real.png"
          alt=""
          width={1672}
          height={941}
          sizes="(max-width: 767px) 170vw, 112vw"
          loading="eager"
          fetchPriority="high"
          draggable={false}
        />
        <span className="camera-glass-light" />
      </div>
    </div>
  );
}
