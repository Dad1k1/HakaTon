// Passwords are never persisted as plaintext, including when upgrading an existing demo.
const iterations = 600000;
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
async function derive(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return hex(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
        key,
        256,
      ),
    ),
  );
}
export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${hex(salt)}$${await derive(password, salt)}`;
}
export async function verifyPassword(password: string, encoded: unknown) {
  if (typeof encoded !== 'string' || !/^pbkdf2\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(encoded))
    return false;
  const [, salt, hash] = encoded.split('$');
  const actual = await derive(
    password,
    Uint8Array.from(salt.match(/../g)!, (v) => parseInt(v, 16)),
  );
  let difference = 0;
  for (let i = 0; i < hash.length; i++) difference |= hash.charCodeAt(i) ^ actual.charCodeAt(i);
  return difference === 0;
}
