'use client';
import { useEffect } from 'react';
export function MotionPills() {
  useEffect(() => {
    const pills = new Map<HTMLElement, HTMLElement>();
    let frame = 0;
    const update = () => {
      document.querySelectorAll<HTMLElement>('.motion-track,.segmented').forEach((track) => {
        let pill = pills.get(track);
        if (!pill) {
          pill = document.createElement('span');
          pill.className = 'moving-pill';
          pill.setAttribute('aria-hidden', 'true');
          track.prepend(pill);
          pills.set(track, pill);
        }
        const selected = track.querySelector<HTMLElement>(
          '[aria-current="page"],[aria-pressed="true"],[aria-selected="true"]',
        );
        if (!selected) {
          pill.style.opacity = '0';
          return;
        }
        pill.style.opacity = '1';
        pill.style.width = selected.offsetWidth + 'px';
        pill.style.height = selected.offsetHeight + 'px';
        pill.style.transform = `translate(${selected.offsetLeft}px,${selected.offsetTop}px)`;
      });
      for (const [track, pill] of pills)
        if (!track.isConnected) {
          pill.remove();
          pills.delete(track);
        }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-current', 'aria-pressed', 'aria-selected', 'class'],
    });
    window.addEventListener('resize', schedule);
    document.addEventListener('transitionend', schedule);
    document.fonts.ready.then(schedule);
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('transitionend', schedule);
      pills.forEach((p) => p.remove());
    };
  }, []);
  return null;
}
