import { logger } from './logger';

export function log(message: string, source = "express") {
  logger.info({ source }, message);
}

/**
 * Get a value from an object by a dot-notation path.
 * Safe for null/undefined intermediate values.
 */
export function getValueByPath(obj: any, path: string): any {
  if (!obj || !path) {return undefined;}
  if (path === '.') {return obj;}

  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[key];
  }

  return current;
}
