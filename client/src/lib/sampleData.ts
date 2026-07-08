/**
 * Sample data generation for template previews.
 * Produces a plausible value for each workflow variable based on its step
 * type, keyed by alias, so a template can be test-rendered without running
 * the workflow.
 */

import type { ApiWorkflowVariable } from "./vault-api";

const SAMPLE_VALUES: Record<string, (label: string) => unknown> = {
    email: () => "jane.doe@example.com",
    phone: () => "(555) 123-4567",
    website: () => "https://example.com",
    number: () => 42,
    currency: () => 1234.56,
    scale: () => 4,
    boolean: () => true,
    date: () => new Date().toISOString().split("T")[0],
    // eslint-disable-next-line @typescript-eslint/naming-convention
    date_time: () => new Date().toISOString(),
    time: () => "14:30",
    // eslint-disable-next-line @typescript-eslint/naming-convention
    multiple_choice: () => ["Option A", "Option B"],
    checkbox: () => ["Option A", "Option B"],
    radio: () => "Option A",
    address: () => ({
        street: "123 Main St",
        street2: "Suite 4",
        city: "Springfield",
        state: "IL",
        zip: "62701",
        country: "USA",
    }),
    // eslint-disable-next-line @typescript-eslint/naming-convention
    multi_field: () => ({ first: "Jane", last: "Doe" }),
    // eslint-disable-next-line @typescript-eslint/naming-convention
    signature_block: () => "Jane Doe",
    signature: () => "Jane Doe",
    // eslint-disable-next-line @typescript-eslint/naming-convention
    file_upload: () => "sample-upload.pdf",
    repeater: () => [
        { item: "First item", amount: 100 },
        { item: "Second item", amount: 250 },
    ],
    // eslint-disable-next-line @typescript-eslint/naming-convention
    loop_group: () => [
        { item: "First item", amount: 100 },
        { item: "Second item", amount: 250 },
    ],
    // eslint-disable-next-line @typescript-eslint/naming-convention
    long_text: (label) =>
        `Sample response for "${label}". This is placeholder text used to preview how the document will look with real content.`,
    computed: () => "Computed value",
};

function sampleValueForType(type: string, label: string): unknown {
    const generator = SAMPLE_VALUES[type];
    return generator !== undefined ? generator(label) : `Sample ${label}`;
}

/**
 * Build an alias-keyed sample data object from workflow variables.
 * Steps without an alias contribute nothing (matching how real document
 * data is assembled).
 */
export function generateSampleData(
    variables: ApiWorkflowVariable[]
): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    for (const variable of variables) {
        if (variable.alias == null || variable.alias === "") {
            continue;
        }
        if (variable.type === "display" || variable.type === "final_documents") {
            continue;
        }
        data[variable.alias] = sampleValueForType(variable.type, variable.label);
    }

    return data;
}
