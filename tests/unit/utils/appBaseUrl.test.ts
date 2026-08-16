import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getAppBaseUrl } from '../../../server/utils/appBaseUrl';

const ORIGINAL_ENV = process.env;

describe('getAppBaseUrl', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.BASE_URL;
    delete process.env.VITE_BASE_URL;
    delete process.env.PUBLIC_URL;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  // The regression this helper exists for. dev and test are production BUILDS
  // deployed to non-production Railway environments, so they run with
  // NODE_ENV=production; call sites that branched on it hardcoded the live
  // domain and sent recipients of a dev invite to www.ezbuildr.com.
  it('ignores NODE_ENV and uses the configured base URL', () => {
    process.env.NODE_ENV = 'production';
    process.env.BASE_URL = 'https://ezbuildr-prod-dev.up.railway.app';

    expect(getAppBaseUrl()).toBe('https://ezbuildr-prod-dev.up.railway.app');
  });

  it('still returns the live domain when that is what is configured', () => {
    process.env.NODE_ENV = 'production';
    process.env.BASE_URL = 'https://www.ezbuildr.com';

    expect(getAppBaseUrl()).toBe('https://www.ezbuildr.com');
  });

  it('strips trailing slashes so callers can append a rooted path', () => {
    process.env.BASE_URL = 'https://ezbuildr-prod-dev.up.railway.app/';

    expect(getAppBaseUrl()).toBe('https://ezbuildr-prod-dev.up.railway.app');
    expect(`${getAppBaseUrl()}/invites/tok/accept`).not.toContain('//invites');
  });

  it('prefers BASE_URL, then VITE_BASE_URL, then PUBLIC_URL', () => {
    process.env.PUBLIC_URL = 'https://public.example.com';
    expect(getAppBaseUrl()).toBe('https://public.example.com');

    process.env.VITE_BASE_URL = 'https://vite.example.com';
    expect(getAppBaseUrl()).toBe('https://vite.example.com');

    process.env.BASE_URL = 'https://base.example.com';
    expect(getAppBaseUrl()).toBe('https://base.example.com');
  });

  it('treats an empty or whitespace value as unconfigured', () => {
    process.env.BASE_URL = '';
    process.env.VITE_BASE_URL = '   ';
    process.env.PUBLIC_URL = 'https://public.example.com';

    expect(getAppBaseUrl()).toBe('https://public.example.com');
  });

  it('falls back to localhost when nothing is configured', () => {
    expect(getAppBaseUrl()).toBe('http://localhost:5000');
  });
});
