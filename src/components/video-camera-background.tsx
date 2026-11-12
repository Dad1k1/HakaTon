'use client';
import { useEffect, useRef } from 'react';
const SENSITIVITY = 0.8;
export function VideoCameraBackground() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let prevX: number | null = null;
    let targetTime = 0;
    let seeking = false;
    let ready = false;
    let frame = 0;
    const seek = () => {
      frame = 0;
      if (!ready || seeking || video.seeking || Math.abs(video.currentTime - targetTime) < 0.012)
        return;
      seeking = true;
      try {
        video.currentTime = targetTime;
      } catch {
        seeking = false;
      }
    };
    const requestSeek = () => {
      if (!frame) frame = requestAnimationFrame(seek);
    };
    const metadata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      ready = true;
      // The middle frame faces the viewer; the first pointer event never jumps the video.
      targetTime = video.duration * 0.5;
      requestSeek();
    };
    const onSeeked = () => {
      seeking = false;
      requestSeek();
    };
    const move = (event: MouseEvent) => {
      if (!ready || reduced.matches) {
        prevX = null;
        return;
      }
      if (prevX === null) {
        prevX = event.clientX;
        return;
      }
      const delta = event.clientX - prevX;
      prevX = event.clientX;
      targetTime = Math.max(
        0,
        Math.min(
          video.duration,
          targetTime + (delta / window.innerWidth) * SENSITIVITY * video.duration,
        ),
      );
      requestSeek();
    };
    const resetPointer = () => {
      prevX = null;
    };
    const preference = () => {
      resetPointer();
      if (reduced.matches) {
        targetTime = video.currentTime;
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };
    const failed = () => {
      ready = false;
      seeking = false;
      cancelAnimationFrame(frame);
      frame = 0;
    };
    video.addEventListener('loadedmetadata', metadata);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', failed);
    window.addEventListener('mousemove', move, { passive: true });
    window.addEventListener('blur', resetPointer);
    window.addEventListener('resize', resetPointer);
    document.documentElement.addEventListener('mouseleave', resetPointer);
    reduced.addEventListener('change', preference);
    if (video.readyState >= 1) metadata();
    return () => {
      cancelAnimationFrame(frame);
      video.removeEventListener('loadedmetadata', metadata);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', failed);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('blur', resetPointer);
      window.removeEventListener('resize', resetPointer);
      document.documentElement.removeEventListener('mouseleave', resetPointer);
      reduced.removeEventListener('change', preference);
    };
  }, []);
  return (
    <video
      ref={ref}
      className="camera-video-background"
      src="/camera-turn.mp4"
      poster="/camera-turn-poster.jpg"
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
      disablePictureInPicture
    />
  );
}
