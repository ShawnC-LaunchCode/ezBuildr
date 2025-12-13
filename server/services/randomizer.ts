import { QuestionNodeConfig } from '../engine/nodes/question';

export class RandomizerService {
    /**
     * Generate random data for a list of questions
     */
    static generateData(questions: QuestionNodeConfig[]): Record<string, any> {
        const data: Record<string, any> = {};

        for (const config of questions) {
            if (!config.key) continue;
            data[config.key] = this.generateValue(config);
        }

        return data;
    }

    /**
     * Generate a single random value based on config
     */
    private static generateValue(config: QuestionNodeConfig): any {
        switch (config.questionType) {
            case 'text':
                return this.randomString();
            case 'number':
                return this.randomNumber(config.validation?.min, config.validation?.max);
            case 'boolean':
                return Math.random() > 0.5;
            case 'select':
                if (config.options && config.options.length > 0) {
                    const idx = Math.floor(Math.random() * config.options.length);
                    return config.options[idx].value;
                }
                return 'option_1';
            case 'multiselect':
                if (config.options && config.options.length > 0) {
                    // Return 1 or 2 options
                    const opts = [...config.options].sort(() => 0.5 - Math.random());
                    return opts.slice(0, 1 + Math.floor(Math.random() * 2)).map(o => o.value);
                }
                return ['option_1'];
            default:
                return 'test_value';
        }
    }

    private static randomString(): string {
        const words = ['foo', 'bar', 'baz', 'qux', 'test', 'demo', 'sample'];
        return words[Math.floor(Math.random() * words.length)] + '_' + Math.floor(Math.random() * 1000);
    }

    private static randomNumber(min?: number, max?: number): number {
        const lower = min ?? 0;
        const upper = max ?? 100;
        return Math.floor(Math.random() * (upper - lower + 1)) + lower;
    }
}
