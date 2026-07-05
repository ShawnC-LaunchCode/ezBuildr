/**
 * Unit tests for the e-signature callback token (C2 security fix).
 *
 * The generic signature callback (POST /api/esign/callback/:runId/:stepId) is otherwise
 * unauthenticated. These tests verify the signed-token control that authenticates it:
 * only a callback carrying the server-derived HMAC for that runId/stepId is accepted.
 */
import { describe, it, expect } from 'vitest';

import { SignatureBlockService } from '../../../server/services/esign/SignatureBlockService';

describe('SignatureBlockService callback token (C2)', () => {
  it('computes a stable, hex HMAC token for a given run/step', () => {
    const a = SignatureBlockService.computeCallbackToken('run-1', 'step-1');
    const b = SignatureBlockService.computeCallbackToken('run-1', 'step-1');
    expect(a).toBe(b); // deterministic
    expect(a).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
  });

  it('produces different tokens for different run/step pairs', () => {
    const t1 = SignatureBlockService.computeCallbackToken('run-1', 'step-1');
    const t2 = SignatureBlockService.computeCallbackToken('run-1', 'step-2');
    const t3 = SignatureBlockService.computeCallbackToken('run-2', 'step-1');
    expect(new Set([t1, t2, t3]).size).toBe(3);
  });

  it('accepts a valid token for the matching run/step', () => {
    const token = SignatureBlockService.computeCallbackToken('run-abc', 'step-xyz');
    expect(SignatureBlockService.verifyCallbackToken('run-abc', 'step-xyz', token)).toBe(true);
  });

  it('rejects a missing token', () => {
    expect(SignatureBlockService.verifyCallbackToken('run-abc', 'step-xyz', undefined)).toBe(false);
    expect(SignatureBlockService.verifyCallbackToken('run-abc', 'step-xyz', '')).toBe(false);
  });

  it('rejects a forged / arbitrary token', () => {
    expect(SignatureBlockService.verifyCallbackToken('run-abc', 'step-xyz', 'not-a-real-token')).toBe(false);
    // A 64-char hex string that is not the correct HMAC must also fail.
    const bogus = 'a'.repeat(64);
    expect(SignatureBlockService.verifyCallbackToken('run-abc', 'step-xyz', bogus)).toBe(false);
  });

  it("rejects a valid token replayed against a different run/step (no cross-run reuse)", () => {
    const token = SignatureBlockService.computeCallbackToken('run-abc', 'step-xyz');
    expect(SignatureBlockService.verifyCallbackToken('run-OTHER', 'step-xyz', token)).toBe(false);
    expect(SignatureBlockService.verifyCallbackToken('run-abc', 'step-OTHER', token)).toBe(false);
  });
});
