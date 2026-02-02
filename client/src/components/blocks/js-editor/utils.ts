export const generateMockValue = (type: string): unknown => {
    switch (type) {
        case 'short_text':
            return 'Sample Text';
        case 'long_text':
            return 'This is a sample long text response with multiple words.';
        case 'yes_no':
            return true;
        case 'radio':
            return 'Option 1';
        case 'multiple_choice':
            return ['Option 1', 'Option 2'];
        case 'date_time':
            return new Date().toISOString();
        case 'file_upload':
            return 'sample-file.pdf';
        case 'loop_group':
            return [{ iteration: 1, value: 'Sample' }];
        default:
            return 'Sample Value';
    }
};

interface Variable {
    key: string;
    type: string;
}

export const generateMockInput = (
    inputKeys: string[],
    testData: Record<string, string>,
    variables: Variable[]
): Record<string, unknown> => {
    const mockInput: Record<string, unknown> = {};

    for (const key of inputKeys) {
        if (testData[key] !== undefined && testData[key] !== '') {
            try {
                mockInput[key] = JSON.parse(testData[key]);
            } catch {
                mockInput[key] = testData[key];
            }
        } else {
            const variable = variables.find((v) => v.key === key);
            if (variable) {
                mockInput[key] = generateMockValue(variable.type);
            } else {
                mockInput[key] = 'Sample Value';
            }
        }
    }

    return mockInput;
};
