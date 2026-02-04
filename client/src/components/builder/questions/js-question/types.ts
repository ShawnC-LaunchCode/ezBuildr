
export interface JSQuestionConfig {
    display: "visible" | "hidden";
    code: string;
    inputKeys: string[];
    outputKey: string;
    timeoutMs?: number;
    helpText?: string;
}
