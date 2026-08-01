/**
 * Test script to verify Helmet security headers are properly configured
 *
 * Usage: tsx scripts/testSecurityHeaders.ts
 */

import express from 'express';

import { applySecurityMiddleware } from '../server/middleware/securityConfig.js';

const app = express();

// Apply security headers
applySecurityMiddleware(app);

// Simple test endpoint
app.get('/test', (req, res) => {
  res.json({ message: 'Security headers test' });
});

// Start server on a test port
const PORT = 5555;
const server = app.listen(PORT, () => {
  console.log(`\nTest server running on http://localhost:${PORT}`);
  console.log('\nMaking test request...\n');

  // Make a test request to check headers
  fetch(`http://localhost:${PORT}/test`)
    .then(async (response) => {
      console.log('Response Headers:');
      console.log('================');

      // Get all headers
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      // Print security-related headers
      const securityHeaderKeys = [
        'content-security-policy',
        'strict-transport-security',
        'x-content-type-options',
        'x-frame-options',
        'x-xss-protection',
        'referrer-policy',
        'x-dns-prefetch-control',
        'x-download-options',
        'x-permitted-cross-domain-policies',
        'cross-origin-opener-policy',
        'cross-origin-embedder-policy',
        'x-powered-by',
      ];

      let allHeadersPresent = true;

      securityHeaderKeys.forEach(key => {
        if (headers[key]) {
          console.log(`✓ ${key}: ${headers[key]}`);
        } else if (key === 'x-powered-by') {
          console.log(`✓ ${key}: (removed - good!)`);
        } else if (key === 'strict-transport-security' && process.env.NODE_ENV !== 'production') {
          console.log(`ℹ ${key}: (disabled in development)`);
        } else if (key === 'cross-origin-embedder-policy') {
          console.log(`ℹ ${key}: (disabled for Google OAuth compatibility)`);
        } else {
          console.log(`✗ ${key}: MISSING`);
          allHeadersPresent = false;
        }
      });

      console.log('\n================');
      if (allHeadersPresent) {
        console.log('✓ All expected security headers are present!');
      } else {
        console.log('✗ Some security headers are missing');
      }

      // Close server
      server.close();
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error testing headers:', error);
      server.close();
      process.exit(1);
    });
});
