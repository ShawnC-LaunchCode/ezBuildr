export class LegalIntegrationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'LegalIntegrationError';
  }
}

export function providerFailureMessage(provider: 'Clio' | 'Stripe', status: number): string {
  if (status === 401 || status === 403) {
    return `${provider} rejected the saved credentials. Reconnect the integration and try again.`;
  }
  if (status === 429) {
    return `${provider} is rate limiting requests. Wait a moment and try again.`;
  }
  return `${provider} could not complete the request. Try again or review the integration setup guide.`;
}
