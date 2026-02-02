
export interface JSBlockConfig {
    name?: string;
    code?: string;
    display?: "invisible" | "visible";
    inputKeys?: string[];
    outputKey?: string;
    timeoutMs?: number;
    testData?: Record<string, string>;
}

export interface JSBlock {
    id?: string;
    type?: string;
    config?: JSBlockConfig;
}
