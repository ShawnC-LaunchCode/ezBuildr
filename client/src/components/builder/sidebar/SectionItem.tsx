import type { ReactNode } from "react";

import type { ApiSection } from "@/lib/vault-api";

import { SectionItemHeader } from "./SectionItemHeader";

interface SectionItemProps {
    section: ApiSection;
    pageCount: number;
    isExpanded: boolean;
    onToggle: () => void;
    onEdit: () => void;
    children: ReactNode;
}

export function SectionItem({
    section,
    pageCount,
    isExpanded,
    onToggle,
    onEdit,
    children,
}: SectionItemProps) {
    return (
        <section className="mb-1" aria-label={`Section ${section.title}`}>
            <SectionItemHeader
                section={section}
                pageCount={pageCount}
                isExpanded={isExpanded}
                onToggle={onToggle}
                onEdit={onEdit}
            />
            {isExpanded && (
                <div className="ml-3 grid grid-cols-[1px_minmax(0,1fr)] gap-x-1.5 pt-1">
                    <div className="bg-sidebar-border" aria-hidden="true" />
                    <div className="min-w-0 space-y-0.5">{children}</div>
                </div>
            )}
        </section>
    );
}
