import { BadRequestException } from '../http/errors';

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutos
const MAX_AGE_MS = 2 * 365 * 24 * 60 * 60 * 1000; // ~2 anios

export function validateTimestamp(timestamp: string): Date {
  const date = new Date(timestamp);
  const now = Date.now();

  if (date.getTime() > now + FUTURE_TOLERANCE_MS) {
    throw new BadRequestException('La fecha de la transaccion no puede ser futura');
  }
  if (date.getTime() < now - MAX_AGE_MS) {
    throw new BadRequestException('La fecha de la transaccion es demasiado antigua');
  }

  return date;
}
