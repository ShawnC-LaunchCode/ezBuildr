
import { Database, FileSpreadsheet, Globe, Link2, Settings, Unlink2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

// Define locally if not exported, or assume shape
export interface DataSource {
    id: string;
    name: string;
    type: string;
    description?: string;
    // Add other properties as needed
}

interface DataSourceCardProps {
    source: DataSource;
    isLinked: boolean;
    isLinkPending: boolean;
    isUnlinkPending: boolean;
    onLink: (id: string) => void;
    onUnlink: (id: string) => void;
    onConfigure: (id: string) => void;
}

export function DataSourceCard({
    source,
    isLinked,
    isLinkPending,
    isUnlinkPending,
    onLink,
    onUnlink,
    onConfigure
}: DataSourceCardProps) {

    // Helper to get icon
    const getIcon = (type: string) => {
        if (type === 'google_sheets') { return FileSpreadsheet; }
        if (type === 'api') { return Globe; }
        return Database;
    };

    const Icon = getIcon(source.type);

    // Helper for labels
    const getTypeLabel = (type: string) => {
        if (type === 'native' || type === 'native_table') { return 'Native Table'; }
        if (type === 'google_sheets') { return 'Google Sheets'; }
        return 'External API';
    };

    const isNative = source.type === 'native' || source.type === 'native_table';

    return (
        <Card className={isLinked ? "border-primary" : ""}>
            <CardHeader className="pb-3">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isNative ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
                            <Icon className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <CardTitle className="text-base">{source.name}</CardTitle>
                                {isLinked && <Badge variant="secondary" className="bg-primary/10 text-primary text-xs">Active</Badge>}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs font-normal">
                                    {getTypeLabel(source.type)}
                                </Badge>
                                {/* Capability Badges */}
                                <div className="flex gap-1">
                                    <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium border border-green-200">Read</span>
                                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium border border-blue-200">Write</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pb-3">
                <CardDescription className="line-clamp-2">{source.description ?? "No description provided."}</CardDescription>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <code>ID: {source.id.slice(0, 8)}...</code>
                    {isNative && <span>PostgreSQL</span>}
                </div>
            </CardContent>
            <CardFooter className="pt-0 flex gap-2">
                {isLinked ? (
                    <Button variant="outline" size="sm" onClick={() => onUnlink(source.id)}
                        disabled={isUnlinkPending} className="w-full">
                        <Unlink2 className="w-4 h-4 mr-2" /> Disconnect
                    </Button>
                ) : (
                    <Button variant="default" size="sm" onClick={() => onLink(source.id)}
                        disabled={isLinkPending} className="w-full">
                        <Link2 className="w-4 h-4 mr-2" /> Connect
                    </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => onConfigure(source.id)}>
                    <Settings className="w-4 h-4" />
                </Button>
            </CardFooter>
        </Card>
    );
}
