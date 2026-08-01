/**
 * Suppresses harmless Google OAuth COOP warnings in the console
 *
 * These warnings are from Google's Identity Services library and don't affect functionality.
 * See: https://github.com/MomenSherif/react-oauth/issues/295
 */
export function suppressGoogleOAuthWarnings(): void {
  const originalWarn = console.warn;
  const originalError = console.error;

  console.warn = function(...args: unknown[]) {
    const message = args[0] === undefined ? '' : String(args[0]);
    // Filter out Google OAuth COOP warnings
    if (message.includes('Cross-Origin-Opener-Policy') &&
        message.includes('window.postMessage')) {
      return;
    }
    originalWarn(...args);
  };

  console.error = function(...args: unknown[]) {
    const message = args[0] === undefined ? '' : String(args[0]);
    // Filter out Google OAuth COOP errors
    if (message.includes('Cross-Origin-Opener-Policy') &&
        message.includes('window.postMessage')) {
      return;
    }
    originalError(...args);
  };
}
