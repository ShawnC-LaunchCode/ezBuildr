import crypto from 'crypto';

import { UAParser } from 'ua-parser-js';

import type { Request } from 'express';

/**
 * Generate a stable device fingerprint from request
 */
export function generateDeviceFingerprint(req: Request): string {
  const components = [
    req.headers['user-agent'] || '',
    // Use X-Forwarded-For if behind proxy, otherwise use req.ip
    req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || '',
  ];

  return crypto
    .createHash('sha256')
    .update(components.join('|'))
    .digest('hex');
}

/**
 * Parse User-Agent into friendly device name
 */
export function parseDeviceName(userAgent: string | undefined): string {
  if (!userAgent) {return 'Unknown Device';}

  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  const browser = result.browser.name || 'Unknown Browser';
  const os = result.os.name || 'Unknown OS';

  // Examples: "Chrome on macOS", "Firefox on Windows", "Safari on iOS"
  return `${browser} on ${os}`;
}

/**
 * Get detailed device info from User-Agent
 */
export function parseDeviceInfo(userAgent: string | undefined): {
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  device: string;
  deviceType: 'mobile' | 'tablet' | 'desktop';
} {
  if (!userAgent) {
    return {
      browser: 'Unknown',
      browserVersion: '',
      os: 'Unknown',
      osVersion: '',
      device: 'Unknown',
      deviceType: 'desktop'
    };
  }

  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  let deviceType: 'mobile' | 'tablet' | 'desktop' = 'desktop';
  if (result.device.type === 'mobile') {deviceType = 'mobile';}
  else if (result.device.type === 'tablet') {deviceType = 'tablet';}

  return {
    browser: result.browser.name || 'Unknown',
    browserVersion: result.browser.version || '',
    os: result.os.name || 'Unknown',
    osVersion: result.os.version || '',
    device: result.device.model || result.device.vendor || 'Unknown',
    deviceType
  };
}

/**
 * Simple location placeholder (returns country from IP)
 * In production, use MaxMind GeoIP2 or similar
 */
export function getLocationFromIP(ip: string | undefined): string {
  if (!ip) {return 'Unknown Location';}

  // Placeholder: In production, integrate with GeoIP service
  // For now, return a default
  return 'Location Unknown';
}
