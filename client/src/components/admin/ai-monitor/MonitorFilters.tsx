import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MonitorFiltersProps {
    timeRange: string;
    setTimeRange: (value: string) => void;
    selectedOperationType: string | undefined;
    setSelectedOperationType: (value: string | undefined) => void;
}

export function MonitorFilters({
    timeRange,
    setTimeRange,
    selectedOperationType,
    setSelectedOperationType
}: MonitorFiltersProps) {
    return (
        <div className="flex items-center gap-4">
            <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                    <SelectItem value="365">Last year</SelectItem>
                </SelectContent>
            </Select>
            <Select value={selectedOperationType ?? 'all'} onValueChange={(v) => setSelectedOperationType(v === 'all' ? undefined : v)}>
                <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All operations" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All operations</SelectItem>
                    <SelectItem value="generation">Generation</SelectItem>
                    <SelectItem value="revision">Revision</SelectItem>
                    <SelectItem value="suggestion">Suggestion</SelectItem>
                    <SelectItem value="logic">Logic</SelectItem>
                    <SelectItem value="optimization">Optimization</SelectItem>
                </SelectContent>
            </Select>
        </div>
    );
}
