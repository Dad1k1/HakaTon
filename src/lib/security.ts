import { db } from './db';
export class BodyLimitError extends Error {}
export class BodyTimeoutError extends Error {}
export async function readLimitedBody(req: Request, limit: number) {
  const reader = req.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  let expired = false;
  const timeout = setTimeout(() => {
    expired = true;
    void reader.cancel().catch(() => {});
  }, 30000);
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (expired) throw new BodyTimeoutError();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new BodyLimitError('Request too large');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
/** Atomic, shared between server processes; expired buckets are removed on each attempt. */
export async function consumeLoginBudget(key: string, limit: number, windowMs: number) {
  const now = new Date(),
    until = new Date(now.getTime() + windowMs);
  await db.loginAttempt.deleteMany({ where: { expiresAt: { lt: now } } });
  const rows = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "LoginAttempt" ("key","count","expiresAt") VALUES (${key},1,${until}) ON CONFLICT ("key") DO UPDATE SET "count" = CASE WHEN "LoginAttempt"."expiresAt" <= ${now} THEN 1 ELSE "LoginAttempt"."count" + 1 END, "expiresAt" = CASE WHEN "LoginAttempt"."expiresAt" <= ${now} THEN ${until} ELSE "LoginAttempt"."expiresAt" END RETURNING "count"`;
  return rows[0].count <= limit;
}

/** Check encoded raster dimensions before browsers/decoders allocate pixel buffers. */
export function safeRasterDimensions(bytes: Buffer, mime: string, maxPixels = 16777216) {
  let width = 0,
    height = 0;
  if (mime === 'image/png' && bytes.length >= 24 && bytes.toString('ascii', 12, 16) === 'IHDR') {
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
  } else if (mime === 'image/jpeg') {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset++] !== 255) return false;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) return false;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) return false;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        if (length < 7) return false;
        height = bytes.readUInt16BE(offset + 3);
        width = bytes.readUInt16BE(offset + 5);
        break;
      }
      offset += length;
    }
  }
  return width > 0 && height > 0 && width <= 8192 && height <= 8192 && width * height <= maxPixels;
}

let passwordWork = 0;
/** Bound expensive password work across login, password changes and admin operations. */
export function acquirePasswordWork(): (() => void) | null {
  if (passwordWork >= 4) return null;
  passwordWork++;
  let released = false;
  return () => {
    if (!released) {
      passwordWork--;
      released = true;
    }
  };
}
