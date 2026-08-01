const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface StoredToken {
  token: string;
  expiresAt: number;
}

/**
 * Parses a stored token from localStorage.
 * Handles both legacy string tokens and new JSON tokens.
 */
function parseTokenData(rawData: string | null): StoredToken | null {
  if (!rawData) {return null;}

  try {
    const parsed = JSON.parse(rawData) as unknown;
    if (parsed && typeof parsed === 'object' && 'token' in parsed && 'expiresAt' in parsed) {
      return parsed as StoredToken;
    }
  } catch (e) {
    // Legacy token format (raw string)
    return { token: rawData, expiresAt: Date.now() + TTL_MS }; // Give legacy tokens a new TTL
  }
  return null;
}

export function setRunToken(runId: string, token: string): void {
  if (typeof window === 'undefined') {return;}
  const data: StoredToken = {
    token,
    expiresAt: Date.now() + TTL_MS,
  };
  localStorage.setItem(`run_token_${runId}`, JSON.stringify(data));
}

export function getRunToken(runId: string): string | null {
  if (typeof window === 'undefined') {return null;}
  const key = `run_token_${runId}`;
  const rawData = localStorage.getItem(key);
  const data = parseTokenData(rawData);

  if (!data) {return null;}

  if (Date.now() > data.expiresAt) {
    localStorage.removeItem(key);
    return null;
  }

  return data.token;
}

export function clearRunToken(runId: string): void {
  if (typeof window === 'undefined') {return;}
  localStorage.removeItem(`run_token_${runId}`);
}

export function cleanupStaleTokens(): void {
  if (typeof window === 'undefined') {return;}
  const keysToRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('run_token_')) {
      const rawData = localStorage.getItem(key);
      const data = parseTokenData(rawData);
      if (!data || Date.now() > data.expiresAt) {
        keysToRemove.push(key);
      }
    }
  }

  keysToRemove.forEach((key) => localStorage.removeItem(key));
}
