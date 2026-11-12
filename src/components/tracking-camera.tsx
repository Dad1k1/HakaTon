'use client';
import { useEffect, useId, useRef } from 'react';

/** Decorative SVG illustration. Pointer coordinates never leave this component. */
export function TrackingCamera({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, '');
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
      <div className="camera-orbit orbit-one" />
      <div className="camera-orbit orbit-two" />
      <svg viewBox="0 0 440 300" focusable="false">
        <defs>
          <linearGradient id={`${id}-shell`} x1="0" y1="0" x2=".8" y2="1">
            <stop stopColor="var(--camera-shell-light)" />
            <stop offset="1" stopColor="var(--camera-shell-dark)" />
          </linearGradient>
          <radialGradient id={`${id}-glass`}>
            <stop stopColor="#345c72" />
            <stop offset=".52" stopColor="#142c3d" />
            <stop offset="1" stopColor="#081620" />
          </radialGradient>
          <linearGradient id={`${id}-beam`}>
            <stop stopColor="#7194a0" stopOpacity=".13" />
            <stop offset="1" stopColor="#7194a0" stopOpacity="0" />
          </linearGradient>
        </defs>
        <ellipse className="camera-shadow" cx="220" cy="269" rx="118" ry="10" />
        <g
          className="camera-mount"
          fill={`url(#${id}-shell)`}
          stroke="var(--camera-outline)"
          strokeWidth="1.5"
        >
          <rect x="120" y="218" width="130" height="13" rx="6.5" />
          <path d="M180 163v58h37v-66h-18v49h-3v-41z" />
          <circle cx="198" cy="164" r="19" />
          <circle cx="198" cy="164" r="7" fill="var(--camera-outline)" />
          <rect x="112" y="205" width="18" height="38" rx="7" />
        </g>
        <g className="camera-head">
          <path className="camera-beam" d="M277 87 434 24v217l-157-90z" fill={`url(#${id}-beam)`} />
          <path
            d="M108 86Q108 70 126 67L252 50Q267 49 279 60l22 24-3 61-141 31-44-29z"
            fill={`url(#${id}-shell)`}
            stroke="var(--camera-outline)"
            strokeWidth="1.5"
          />
          <path
            d="m108 86 46 25 147-27M154 111v65"
            fill="none"
            stroke="var(--camera-outline)"
            strokeWidth="1.5"
          />
          <path
            d="m100 78 150-23q13-2 23 8l36 34-155 27-54-29z"
            fill="var(--camera-hood)"
            stroke="var(--camera-outline)"
            strokeWidth="1.5"
          />
          <path d="m160 124 133-25-2 44-131 27z" fill="var(--camera-face)" />
          <g className="camera-lens">
            <ellipse
              cx="244"
              cy="131"
              rx="29"
              ry="31"
              transform="rotate(10 244 131)"
              fill="#1d2933"
              stroke="#53636e"
              strokeWidth="2"
            />
            <ellipse cx="244" cy="131" rx="22" ry="24" fill={`url(#${id}-glass)`} />
            <ellipse className="camera-pupil" cx="244" cy="132" rx="11" ry="13" fill="#060f16" />
            <ellipse cx="238" cy="121" rx="6" ry="4" fill="#b4d5e4" opacity=".6" />
            <circle cx="252" cy="140" r="2" fill="#6e9ab1" opacity=".5" />
          </g>
          <circle className="camera-indicator" cx="179" cy="143" r="3" fill="#dc454c" />
          <path
            d="m120 112 19 10m-19-3 19 10m-19-3 19 10"
            stroke="var(--camera-outline)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="169" cy="158" r="1.5" fill="var(--camera-outline)" />
          <circle cx="285" cy="114" r="1.5" fill="var(--camera-outline)" />
        </g>
      </svg>
    </div>
  );
}
