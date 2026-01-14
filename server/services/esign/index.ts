/**
 * E-Signature Services - Main Export
 * Central export point for all e-signature functionality
 *
 * @version 1.0.0 - Prompt 11 (E-Signature Integration)
 * @date December 2025
 */

// Provider interface and factory
export { EsignProviderFactory } from './EsignProvider';
export type {
  IEsignProvider,
  CreateEnvelopeRequest,
  CreateEnvelopeResponse,
  EnvelopeStatusResponse,
  SignatureEvent,
  SignatureDocument,
  SignerInfo,
} from './EsignProvider';
export {
  EsignError,
  EsignConfigError,
  EsignApiError,
  EsignStateError,
} from './EsignProvider';

// DocuSign implementation
export { DocusignProvider, createDocusignProvider } from './DocusignProvider';
export type { DocusignConfig } from './DocusignProvider';

// Envelope builder
export { EnvelopeBuilder } from './EnvelopeBuilder';
export type { BuildEnvelopeRequest } from './EnvelopeBuilder';

// Signature block service
export { SignatureBlockService } from './SignatureBlockService';

// Initialize providers on module load
import { createDocusignProvider } from './DocusignProvider';
import { EsignProviderFactory } from './EsignProvider';

/**
 * Initialize all configured e-signature providers
 */
export function initializeEsignProviders(): void {
  // Register DocuSign if configured
  const docusignProvider = createDocusignProvider();
  if (docusignProvider) {
    EsignProviderFactory.registerProvider('docusign', docusignProvider);
    console.log('[Esign] DocuSign provider registered');
  }

  // TODO: Register other providers (HelloSign, Native)
  // const hellosignProvider = createHellosignProvider();
  // if (hellosignProvider) {
  //   EsignProviderFactory.registerProvider('hellosign', hellosignProvider);
  // }

  const registeredProviders = EsignProviderFactory.getAllProviders();
  console.log(`[Esign] Initialized ${registeredProviders.length} provider(s): ${registeredProviders.join(', ')}`);
}
