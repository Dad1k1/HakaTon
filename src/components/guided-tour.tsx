'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Compass, X } from './ui/icons';
import { useApp } from './context';
import { Button } from './ui/button';
const steps = ['nav-appeals', 'create', 'form', 'anonymous', 'submit'] as const;

type Rect = { top: number; left: number; width: number; height: number };
export function GuidedTour({
  openForm,
  openMenu,
  close,
  dismiss,
}: {
  openForm: () => void;
  openMenu: (open: boolean) => void;
  close: () => void;
  dismiss: (permanent: boolean) => Promise<void>;
}) {
  const t = useTranslations();
  const { navigate, setError } = useApp();
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [dontShow, setDontShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tipHeight, setTipHeight] = useState(250);
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const tip = useRef<HTMLDivElement>(null);
  const actions = useRef({ openForm, openMenu });
  actions.current = { openForm, openMenu };
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  useEffect(
    () => () => {
      previousFocus.current?.focus();
    },
    [],
  );
  useEffect(() => {
    if (step === 0) actions.current.openMenu(window.innerWidth < 768);
    if (step === 1) {
      navigate({ view: 'appeals' });
      actions.current.openMenu(false);
    }
    if (step >= 2) actions.current.openForm();
  }, [step, navigate]);
  useLayoutEffect(() => {
    let target: HTMLElement | null = null;
    const measure = () => {
      const next = document.querySelector<HTMLElement>(`[data-tour="${steps[step]}"]`);
      if (next && target !== next) {
        target = next;
        next.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        const focusable = next.matches('button, input')
          ? next
          : next.querySelector<HTMLElement>('input, button');
        focusable?.focus({ preventScroll: true });
      }
      if (next) {
        const r = next.getBoundingClientRect();
        setRect({
          top: Math.max(8, r.top - 7),
          left: Math.max(8, r.left - 7),
          width: Math.min(r.width + 14, window.innerWidth - 16),
          height: Math.min(r.height + 14, window.innerHeight - 16),
        });
      }
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    const observer = new MutationObserver((records) => {
      if (records.some((record) => !(record.target as Element).closest?.('.tour-layer'))) measure();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const frame = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    document.addEventListener('transitionend', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      document.removeEventListener('transitionend', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step]);
  useLayoutEffect(() => {
    if (!tip.current) return;
    const observer = new ResizeObserver(() => setTipHeight(tip.current?.offsetHeight || 250));
    observer.observe(tip.current);
    return () => observer.disconnect();
  }, []);
  const finish = async () => {
    setBusy(true);
    try {
      await dismiss(dontShow);
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const target = document.querySelector<HTMLElement>(`[data-tour="${steps[step]}"]`);
        const highlighted = target?.matches('button, input')
          ? [target]
          : Array.from(
              target?.querySelectorAll<HTMLElement>(
                'button:not(:disabled),input,select,textarea',
              ) || [],
            );
        const controls = [
          ...highlighted,
          ...Array.from(
            tip.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input') || [],
          ),
        ];
        if (controls.length) {
          e.preventDefault();
          e.stopImmediatePropagation();
          const i = controls.indexOf(document.activeElement as HTMLElement);
          controls[(i + (e.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        void finishRef.current();
      }
    };
    const click = (e: MouseEvent) => {
      if (!(e.target as Element).closest(`[data-tour="${steps[step]}"]`)) return;
      if (step === 4) {
        e.preventDefault();
        e.stopPropagation();
        void finishRef.current();
      } else if (step < 2) setStep((s) => s + 1);
    };
    const submit = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('keydown', key, true);
    document.addEventListener('click', click, true);
    document.addEventListener('submit', submit, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('submit', submit, true);
    };
  }, [step]);
  const width = Math.min(352, viewport.width - 32);
  const left = rect ? Math.min(Math.max(16, rect.left), viewport.width - width - 16) : 16;
  const below = rect ? rect.top + rect.height + 16 : 100;
  const top =
    below + tipHeight < viewport.height - 16
      ? below
      : Math.max(16, (rect?.top || viewport.height) - tipHeight - 16);
  return createPortal(
    <div className="tour-layer">
      {rect && (
        <>
          <div className="tour-spotlight" style={rect} />
          <div className="tour-shield" style={{ inset: `0 0 auto 0`, height: rect.top }} />
          <div
            className="tour-shield"
            style={{ left: 0, top: rect.top, width: rect.left, height: rect.height }}
          />
          <div
            className="tour-shield"
            style={{ left: rect.left + rect.width, right: 0, top: rect.top, height: rect.height }}
          />
          <div
            className="tour-shield"
            style={{ left: 0, right: 0, top: rect.top + rect.height, bottom: 0 }}
          />
        </>
      )}
      <div
        ref={tip}
        className="tour-tip panel"
        style={{ top, left, width }}
        role="dialog"
        aria-labelledby="guide-title"
        aria-describedby="guide-description"
      >
        <div className="flex justify-between items-center mb-4">
          <span className="tour-step">
            <Compass size={15} />
            {t('tour.step', { current: step + 1, total: steps.length })}
          </span>
          <button aria-label={t('close')} onClick={() => void finish()} disabled={busy}>
            <X size={17} />
          </button>
        </div>
        <div key={step} className="tour-copy" aria-live="polite" aria-atomic="true">
          <h2 id="guide-title" className="text-lg font-semibold">
            {t(`tour.${steps[step]}.title`)}
          </h2>
          <p id="guide-description" className="muted text-xs leading-6 mt-2">
            {t(`tour.${steps[step]}.text`)}
          </p>
        </div>
        <div className="tour-dots" aria-hidden="true">
          {steps.map((s, i) => (
            <i key={s} className={i <= step ? 'active' : ''} />
          ))}
        </div>
        <label className="flex gap-2 items-center text-xs muted font-normal mb-4">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
          />
          {t('dontShow')}
        </label>
        <div className="flex justify-between gap-2 items-center">
          <Button variant="ghost" size="sm" onClick={() => void finish()} disabled={busy}>
            {t('tour.skip')}
          </Button>
          <div className="flex gap-2">
            {step > 2 && (
              <Button
                variant="outline"
                size="icon"
                className="!h-8 !w-8"
                aria-label={t('back')}
                onClick={() => setStep((s) => s - 1)}
              >
                <ArrowLeft size={14} />
              </Button>
            )}
            <Button
              size="sm"
              disabled={busy}
              onClick={() => (step === steps.length - 1 ? void finish() : setStep((s) => s + 1))}
            >
              {t(step === steps.length - 1 ? 'tour.finish' : 'next')}
              <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
