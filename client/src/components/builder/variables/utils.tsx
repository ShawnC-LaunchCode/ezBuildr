
import { Database, Code, Layers, ListTree } from "lucide-react";
import { ReactNode } from "react";

export const isListType = (type: string): boolean => {
    return type === "query" || type === "read_table" || type === "list_tools";
};

export const getVariableIcon = (type: string): ReactNode => {
    if (isListType(type)) { return <Database className="w-3.5 h-3.5 text-blue-500" />; }
    if (type === "list") { return <ListTree className="w-3.5 h-3.5 text-blue-500" />; }
    if (type === "js_question" || type === "computed") { return <Code className="w-3.5 h-3.5 text-purple-500" />; }
    return <Layers className="w-3.5 h-3.5 text-gray-500" />;
};
