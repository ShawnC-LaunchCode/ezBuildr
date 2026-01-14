/**
 * Security Headers Middleware
 *
 * Implements comprehensive security headers using Helmet middleware to protect
 * against common web vulnerabilities. Based on OWASP recommendations and modern
 * security best practices.
 *
 * Headers implemented via Helmet:
 * - Content Security Policy (CSP) - Prevents XSS, code injection
 * - Strict-Transport-Security (HSTS) - Forces HTTPS
 * - X-Content-Type-Options - Prevents MIME sniffing
 * - X-Frame-Options - Prevents clickjacking
 * - X-XSS-Protection - Legacy XSS protection (for older browsers)
 * - Referrer-Policy - Controls referrer information
 * - Permissions-Policy - Controls browser features
 * - X-DNS-Prefetch-Control - Controls DNS prefetching
 * - X-Download-Options - Prevents IE from executing downloads
 * - X-Permitted-Cross-Domain-Policies - Controls cross-domain policies
 *
 * Created: December 22, 2025
 * Updated: December 25, 2025 - Migrated to Helmet middleware
 * Security Audit Fix
 */

import helmet from 'helmet';

import { createLogger } from '../logger.js';

import type { Request, Response, NextFunction } from 'express';

const logger = createLogger({ module: 'security-headers' });

/**
 * Security headers configuration
 */
interface SecurityHeadersConfig {
  /** Enable CSP header */
  enableCSP?: boolean;
  /** Enable HSTS header (only in production) */
  enableHSTS?: boolean;
  /** HSTS max age in seconds (default: 1 year) */
  hstsMaxAge?: number;
  /** Allow framing from same origin (default: DENY) */
  allowFraming?: 'DENY' | 'SAMEORIGIN';
  /** Additional CSP directives */
  cspDirectives?: Record<string, string[]>;
}

/**
 * Default security headers middleware using Helmet
 *
 * Usage:
 * ```typescript
 * import { securityHeaders } from './middleware/securityHeaders.js';
 * app.use(securityHeaders());
 * ```
 */
export function securityHeaders(config: SecurityHeadersConfig = {}) {
  const {
    enableCSP = true,
    enableHSTS = process.env.NODE_ENV === 'production',
    hstsMaxAge = 31536000, // 1 year
    allowFraming = 'DENY',
    cspDirectives = {},
  } = config;

  // Base CSP directives (strict but functional)
  const defaultDirectives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'unsafe-inline'", // Required for React/Vite in development
      "'unsafe-eval'",   // Required for some JS libraries (consider removing in prod)
      'https://*.google.com',
      'https://*.gstatic.com',
      'https://*.googleapis.com',
    ],
    'style-src': [
      "'self'",
      "'unsafe-inline'", // Required for styled-components, Tailwind
      'https://*.googleapis.com',
      'https://*.google.com',
      'https://*.gstatic.com',
    ],
    'font-src': [
      "'self'",
      'https://*.gstatic.com',
      'https://*.googleapis.com',
      'data:', // Allow data URIs for fonts
    ],
    'img-src': [
      "'self'",
      'data:',       // Data URIs for inline images
      'blob:',       // Blob URLs for generated images
      'https:',      // Allow HTTPS images (consider restricting)
    ],
    'connect-src': [
      "'self'",
      'https://*.google.com',
      'https://*.googleapis.com',
      'https://*.gstatic.com',
      'wss://localhost:*', // WebSocket for development
      'ws://localhost:*',
    ],
    'frame-src': [
      "'self'",
      'https://*.google.com',
      'https://*.firebaseapp.com', // Firebase Auth if used
    ],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"], // Prevent framing (redundant with X-Frame-Options)
    'upgrade-insecure-requests': [], // Upgrade HTTP to HTTPS
  };

  // Merge with custom directives
  const mergedDirectives = { ...defaultDirectives, ...cspDirectives };

  // Convert directives to Helmet format
  const helmetCSPDirectives: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(mergedDirectives)) {
    helmetCSPDirectives[key] = values;
  }

  // Configure Helmet with all security headers
  return helmet({
    // Content Security Policy
    contentSecurityPolicy: enableCSP ? {
      directives: helmetCSPDirectives,
    } : false,

    // HTTP Strict Transport Security
    hsts: enableHSTS ? {
      maxAge: hstsMaxAge,
      includeSubDomains: true,
      preload: true,
    } : false,

    // X-Frame-Options (clickjacking protection)
    frameguard: {
      action: allowFraming.toLowerCase() as 'deny' | 'sameorigin',
    },

    // X-Content-Type-Options (MIME sniffing protection)
    noSniff: true,

    // X-XSS-Protection (legacy XSS protection for older browsers)
    xssFilter: true,

    // Referrer-Policy
    referrerPolicy: {
      policy: 'no-referrer-when-downgrade',
    },

    // X-DNS-Prefetch-Control (controls DNS prefetching)
    dnsPrefetchControl: {
      allow: false,
    },

    // X-Download-Options (prevents IE from executing downloads in site context)
    ieNoOpen: true,

    // Hide X-Powered-By header
    hidePoweredBy: true,

    // Permissions-Policy (controls browser features)
    permittedCrossDomainPolicies: {
      permittedPolicies: 'none',
    },

    // Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy
    // Set to unsafe-none for Google OAuth compatibility
    crossOriginOpenerPolicy: {
      policy: 'unsafe-none',
    },
    crossOriginEmbedderPolicy: false,
  });
}

/**
 * Relaxed security headers for development/testing
 *
 * Use this in development if strict CSP breaks your workflow.
 * NEVER use in production!
 */
export function relaxedSecurityHeaders() {
  logger.warn('Using relaxed security headers - NOT suitable for production');
  return securityHeaders({
    enableCSP: false,
    enableHSTS: false,
    allowFraming: 'SAMEORIGIN',
  });
}

/**
 * Maximum security headers for production
 *
 * Strictest possible configuration. Use this in production.
 * Removes unsafe-inline and unsafe-eval from CSP directives.
 */
export function strictSecurityHeaders() {
  logger.info('Using strict security headers - production configuration');
  return securityHeaders({
    enableCSP: true,
    enableHSTS: true,
    hstsMaxAge: 63072000, // 2 years
    allowFraming: 'DENY',
    cspDirectives: {
      // Override with strict directives (no unsafe-inline, no unsafe-eval)
      'script-src': [
        "'self'",
        'https://accounts.google.com',
        'https://www.google.com',
        'https://www.gstatic.com',
      ],
      'style-src': [
        "'self'",
        'https://fonts.googleapis.com',
        'https://accounts.google.com',
      ],
    },
  });
}

// Log security headers configuration on module load
logger.info({
  environment: process.env.NODE_ENV,
  hstsEnabled: process.env.NODE_ENV === 'production',
}, 'Security headers middleware loaded');
