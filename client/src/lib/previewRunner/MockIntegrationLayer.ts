/**
 * MockIntegrationLayer
 * 
 * Intercepts "dangerous" or external calls during preview mode
 * and returns simulated success/failure responses.
 */

export interface MockDocumentResult {
    url: string;
    name: string;
    generatedAt: string;
}

export interface MockSignatureResult {
    envelopeId: string;
    status: 'sent' | 'delivered' | 'signed' | 'declined';
}

export class MockIntegrationLayer {

    /**
     * Simulate document generation
     */
    async generateDocument(templateId: string, variables: Record<string, any>): Promise<MockDocumentResult> {
        console.log('[Preview Mock] Generating document for template:', templateId, 'with vars:', variables);

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1500));

        return {
            url: `blob:mock-document-${templateId}.pdf`,
            name: `Preview Document (${new Date().toLocaleTimeString()}).pdf`,
            generatedAt: new Date().toISOString()
        };
    }

    /**
     * Simulate creating a signature envelope
     */
    async createSignatureEnvelope(signerEmail: string, documents: string[]): Promise<MockSignatureResult> {
        console.log('[Preview Mock] Creating signature envelope for:', signerEmail, 'docs:', documents);

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        return {
            envelopeId: `mock-env-${Math.floor(Math.random() * 10000)}`,
            status: 'sent'
        };
    }

    /**
     * Simulate checking signature status
     */
    async checkSignatureStatus(envelopeId: string): Promise<'signed' | 'pending'> {
        console.log('[Preview Mock] Checking status for:', envelopeId);

        // Randomly decide if signed
        return Math.random() > 0.5 ? 'signed' : 'pending';
    }

    /**
     * Simulate file upload
     */
    async uploadFile(file: File): Promise<string> {
        console.log('[Preview Mock] Uploading file:', file.name);

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Return a fake URL
        return `https://mock-storage.vaultlogic.com/${file.name}`;
    }
}

export const mockIntegration = new MockIntegrationLayer();
