const LOCAL_PATH_PREFIX = '/';

export function getSafeReturnTo(search: string): string | null {
  const returnTo = new URLSearchParams(search).get('returnTo');

  if (
    !returnTo?.startsWith(LOCAL_PATH_PREFIX) ||
    returnTo.startsWith('//') ||
    returnTo.includes('\\')
  ) {
    return null;
  }

  return returnTo;
}

export function withReturnTo(path: string, returnTo: string): string {
  return `${path}?returnTo=${encodeURIComponent(returnTo)}`;
}
