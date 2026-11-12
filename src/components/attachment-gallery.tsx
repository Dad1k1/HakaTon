'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from './ui/button';
import { X } from './ui/icons';
import type { Appeal } from './context';
export function AttachmentGallery({ files }: { files: Appeal['attachments'] }) {
  const t = useTranslations();
  const [image, setImage] = useState<Appeal['attachments'][number] | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!image) return;
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [image]);
  return (
    <>
      <div className="attachment-gallery">
        {files.map((f) =>
          ['image/png', 'image/jpeg'].includes(f.mime) ? (
            <button
              key={f.id}
              className="attachment-image"
              onClick={() => setImage(f)}
              aria-label={`${t('previewImage')}: ${f.name}`}
            >
              <img src={`/api/data/files/${f.id}?inline=1`} alt={f.name} loading="lazy" />
              <span>{f.name}</span>
            </button>
          ) : (
            <a key={f.id} className="attachment-document" href={`/api/data/files/${f.id}`}>
              {f.name}
              <span className="muted">{Math.ceil(f.size / 1024)} KB</span>
            </a>
          ),
        )}
      </div>
      {image && (
        <dialog
          ref={dialog}
          className="image-preview"
          aria-label={image.name}
          onCancel={() => setImage(null)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setImage(null);
          }}
        >
          <div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('close')}
              onClick={() => setImage(null)}
            >
              <X />
            </Button>
            <img src={`/api/data/files/${image.id}?inline=1`} alt={image.name} />
            <p>{image.name}</p>
          </div>
        </dialog>
      )}
    </>
  );
}
