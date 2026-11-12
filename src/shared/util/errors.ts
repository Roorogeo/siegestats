import type { AppError, AppErrorCode } from '../types/provider';

const CODES: readonly AppErrorCode[] = [
  'not_found', 'rate_limited', 'unavailable', 'network', 'unsupported', 'not_configured', 'unknown',
];

/** Errors are plain objects so they survive IPC and the context bridge intact. */
export const appError = (code: AppErrorCode, message: string, retryAfterSec: number | null = null): AppError => ({
  code,
  message,
  retryAfterSec,
});

export function isAppError(value: unknown): value is AppError {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.message === 'string' && typeof v.code === 'string' && (CODES as readonly string[]).includes(v.code);
}

export function toAppError(value: unknown): AppError {
  if (isAppError(value)) return appError(value.code, value.message, value.retryAfterSec ?? null);
  if (typeof value === 'object' && value !== null && 'message' in value) {
    return appError('unknown', String((value as { message: unknown }).message));
  }
  return appError('unknown', typeof value === 'string' ? value : 'Unexpected error');
}

/** For parts of the Bridge whose phase has not been built yet. */
export const notBuiltYet = (what: string, phase: number): AppError =>
  appError('unsupported', `${what} arrives in phase ${phase}.`);
