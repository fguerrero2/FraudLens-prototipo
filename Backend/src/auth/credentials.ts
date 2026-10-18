import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export function token() { return randomBytes(32).toString('base64url'); }
export function hashToken(value: string) { return createHash('sha256').update(value).digest('hex'); }
export function hashPassword(value: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(value, salt, 64).toString('hex')}`;
}
export function verifyPassword(value: string, encoded: string) {
  const [salt, hash] = encoded.split(':');
  if (!salt || !hash || hash.length !== 128) return false;
  return timingSafeEqual(scryptSync(value, salt, 64), Buffer.from(hash, 'hex'));
}
