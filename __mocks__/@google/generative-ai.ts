
import { vi } from 'vitest';

export const GoogleGenerativeAI = class MockGoogleGenerativeAI {
    constructor(_apiKey: string) { }
    getGenerativeModel(_params: unknown) {
        return {
            generateContent: vi.fn().mockResolvedValue({
                response: { text: () => JSON.stringify({}) }
            })
        };
    }
};
