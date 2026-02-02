import { logger } from './logger';

export function log(message: string, source = "express"): void {
  logger.info({ source }, message);
}

/**
 * Get a value from an object by a dot-notation path.
 * Safe for null/undefined intermediate values.
 */
export function getValueByPath(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined || path === '') {return undefined;}
  if (path === '.') {return obj;}

  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}
