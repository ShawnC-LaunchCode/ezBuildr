import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";

interface ReviewStatsCardProps {
    label: string;
    value: string | number;
    icon: LucideIcon;
    highlight?: boolean;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function ReviewStatsCard({ label, value, icon: IconComponent, highlight }: ReviewStatsCardProps) {
    return (
        <motion.div
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
            <Card className={`overflow-hidden border-0 shadow-sm ring-1 transition-all duration-300 ${highlight ? 'ring-indigo-200 shadow-indigo-100/50 bg-gradient-to-br from-indigo-50/80 to-white' : 'ring-slate-200/50 hover:shadow-md hover:ring-slate-300/50 bg-white/95 backdrop-blur-sm'}`}>
                <CardContent className="p-6 flex items-center gap-5">
                    <div className={`p-3.5 rounded-2xl shadow-sm ${highlight ? 'bg-indigo-500 text-white shadow-indigo-200' : 'bg-slate-100 text-slate-600 shadow-slate-200/50'}`}>
                        <IconComponent className="w-5 h-5" />
                    </div>
                    <div>
                        <p className={`text-sm font-medium tracking-wide ${highlight ? 'text-indigo-600/80 uppercase' : 'text-slate-500 uppercase'}`}>{label}</p>
                        <p className={`text-3xl font-semibold tracking-tight ${highlight ? 'text-indigo-900' : 'text-slate-900'}`}>{value}</p>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}
