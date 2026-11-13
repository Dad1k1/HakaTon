'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useApp } from './context';
import { Avatar } from './ui/avatar';
import { Button } from './ui/button';
export function AvatarUpload() {
  const t = useTranslations();
  const { user, api, refresh, setError } = useApp();
  const [busy, setBusy] = useState(false);
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    const url = URL.createObjectURL(file);
    try {
      if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('fileType');
      if (file.size > 5 * 1024 * 1024) throw new Error('fileSize');
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 192;
      canvas.height = 192;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('serverError');
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      ctx.fillStyle = '#f1f1ee';
      ctx.fillRect(0, 0, 192, 192);
      ctx.drawImage(
        img,
        (img.naturalWidth - side) / 2,
        (img.naturalHeight - side) / 2,
        side,
        side,
        0,
        0,
        192,
        192,
      );
      await api('profile', { avatar: canvas.toDataURL('image/jpeg', 0.82) });
      refresh();
    } catch (e) {
      setError((e as Error).message || 'fileType');
    } finally {
      URL.revokeObjectURL(url);
      setBusy(false);
    }
  }
  return (
    <div className="avatar-upload">
      <Avatar person={user} />
      <div>
        <label className="attach-control">
          {busy ? t('loading') : t('uploadAvatar')}
          <input
            aria-label={t('uploadAvatar')}
            type="file"
            accept="image/png,image/jpeg"
            disabled={busy}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        <p className="muted text-xs mt-2">{t('avatarHint')}</p>
        {user.avatar && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api('profile', { avatar: null });
                refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('removeAvatar')}
          </Button>
        )}
      </div>
    </div>
  );
}
