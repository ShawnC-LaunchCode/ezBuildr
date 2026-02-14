/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
/**
 * Suppresses harmless Google OAuth COOP warnings in the console
 *
 * These warnings are from Google's Identity Services library and don't affect functionality.
 * See: https://github.com/MomenSherif/react-oauth/issues/295
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function suppressGoogleOAuthWarnings() {
  const originalWarn = console.warn;
  const originalError = console.error;

  console.warn = function(...args) {
    const message = args[0]?.toString() ?? '';
    // Filter out Google OAuth COOP warnings
    if (message.includes('Cross-Origin-Opener-Policy') &&
        message.includes('window.postMessage')) {
      return;
    }
    originalWarn.apply(console, args);
  };

  console.error = function(...args) {
    const message = args[0]?.toString() ?? '';
    // Filter out Google OAuth COOP errors
    if (message.includes('Cross-Origin-Opener-Policy') &&
        message.includes('window.postMessage')) {
      return;
    }
    originalError.apply(console, args);
  };
}
