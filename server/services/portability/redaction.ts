import { ExportWarning } from './bundleFormat';

export function applyRedaction(rowData: Record<string, unknown>, redactPaths: string[] | undefined): void {
  if (!redactPaths?.length) {
    return;
  }
  for (const path of redactPaths) {
    walkPath(rowData, path.split('.'), 0, handleLeafNode);
  }
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function clearArray(arr: unknown[]): void {
  for (let i = 0; i < arr.length; i++) {
    arr[i] = null;
  }
}

function clearObject(record: Record<string, unknown>): void {
  for (const k of Object.keys(record)) {
    record[k] = null;
  }
}

function handleLeafNode(current: Record<string, unknown>, key: string, isArrayElement: boolean): void {
  const target = current[key];
  if (isArrayElement && Array.isArray(target)) {
    clearArray(target);
  } else if (isObject(target) && !Array.isArray(target)) {
    clearObject(target);
  } else if (key in current) {
    current[key] = null;
  }
}

function walkPath(
  current: unknown,
  parts: string[],
  partIndex: number,
  onLeaf: (parent: Record<string, unknown>, key: string, isArrayElement: boolean) => void
): void {
  if (!isObject(current)) {
    return;
  }
  const part = parts[partIndex];
  if (part === undefined) {
    return;
  }
  
  const isArrayElement = part.endsWith('[]');
  const key = isArrayElement ? part.slice(0, -2) : part;
  
  if (partIndex === parts.length - 1) {
    onLeaf(current, key, isArrayElement);
  } else {
    const next = current[key];
    if (next == null) {
      return;
    }
    
    if (isArrayElement && Array.isArray(next)) {
      for (const item of next) {
        walkPath(item, parts, partIndex + 1, onLeaf);
      }
    } else {
      walkPath(next, parts, partIndex + 1, onLeaf);
    }
  }
}

/**
 * Vendor-issued credential formats, which are unambiguous enough to flag on
 * sight regardless of surrounding code.
 */
const VENDOR_TOKEN = /\b(sk-[A-Za-z0-9]{16,}|r?sk_(live|test)_[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,})/;

/**
 * A credential-ish identifier assigned a *string literal* — `const apiKey =
 * "…"`. Deliberately not a bare word match: `ctx.secrets.get("STRIPE")` is the
 * documented, correct way to reach a secret in this codebase, and flagging it
 * would train people to ignore the warning that matters.
 */
const ASSIGNED_LITERAL = /(secret|token|api[_-]?key|password|passwd|credential)\w*\s*[:=]\s*(['"`])([^'"`\n]{8,})\2/i;

/** A long opaque literal — the shape of a pasted key. */
const LONG_LITERAL = /(['"`])([A-Za-z0-9+/_=-]{32,})\1/;

/** UUIDs are long and opaque but are identifiers, not credentials. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksLikeSecret(line: string): boolean {
  if (VENDOR_TOKEN.test(line) || ASSIGNED_LITERAL.test(line)) {
    return true;
  }
  const longLiteral = LONG_LITERAL.exec(line);
  return longLiteral !== null && !UUID.test(longLiteral[2] ?? '');
}

export function scanForSecrets(
  entityName: string,
  rowData: Record<string, unknown>,
  scanPaths: string[] | undefined
): ExportWarning[] {
  if (!scanPaths?.length) {
    return [];
  }
  const warnings: ExportWarning[] = [];

  for (const path of scanPaths) {
    walkPath(rowData, path.split('.'), 0, (current, key, isArrayElement) => {
      const target = current[key];
      if (isArrayElement && Array.isArray(target)) {
        for (const item of target) {
          scanRecursive(item, entityName, path, warnings);
        }
      } else {
        scanRecursive(target, entityName, path, warnings);
      }
    });
  }
  return warnings;
}

function scanRecursive(val: unknown, entityName: string, path: string, warnings: ExportWarning[]): void {
  if (typeof val === 'string') {
    scanStringForSecrets(entityName, path, val, warnings);
  } else if (Array.isArray(val)) {
    for (const item of val) {
      scanRecursive(item, entityName, path, warnings);
    }
  } else if (isObject(val)) {
    for (const v of Object.values(val)) {
      scanRecursive(v, entityName, path, warnings);
    }
  }
}

function scanStringForSecrets(
  entityName: string,
  path: string,
  value: string,
  warnings: ExportWarning[]
): void {
  const lines = value.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (looksLikeSecret(lines[i] ?? '')) {
      warnings.push({
        type: 'secret_scan',
        entity: entityName,
        column: path,
        line: i + 1,
        // Never quote the match: the manifest is the part a user is most
        // likely to paste into a ticket or a chat.
        message: `Possible secret found in ${entityName}.${path} at line ${i + 1}. Please review before sharing.`
      });
    }
  }
}
