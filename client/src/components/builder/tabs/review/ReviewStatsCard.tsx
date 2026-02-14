
import { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

interface ReviewStatsCardProps {
    label: string;
    value: string | number;
    icon: LucideIcon;
    highlight?: boolean;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function ReviewStatsCard({ label, value, icon: IconComponent, highlight }: ReviewStatsCardProps) {
    return (
        <Card>
            <CardContent className="p-6 flex items-center gap-4">
                <div className={`p-3 rounded-full ${highlight ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600'}`}>
                    <IconComponent className="w-5 h-5" />
                </div>
                <div>
                    <p className="text-sm text-slate-500 font-medium">{label}</p>
                    <p className="text-2xl font-semibold text-slate-900">{value}</p>
                </div>
            </CardContent>
        </Card>
    );
}
