import { useState, useEffect } from "react";

export interface CollisionItem {
    originalWorkflowAlias: string;
    originalSnipAlias: string;
    resolvedWorkflowAlias: string;
    resolvedSnipAlias: string;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useCollisionResolution(collisions: string[]) {
    const [items, setItems] = useState<CollisionItem[]>([]);
    const [errors, setErrors] = useState<Record<number, string>>({});

    // Initialize items when collisions change
    useEffect(() => {
        if (collisions.length > 0) {
            const initialItems: CollisionItem[] = collisions.map(alias => {
                // Generate auto-renamed workflow alias (add _2 suffix)
                const parts = alias.split('.');
                let renamedWorkflowAlias: string;
                if (parts.length > 1) {
                    // Has namespace: respondent.name.first -> respondent_2.name.first
                    renamedWorkflowAlias = `${parts[0]}_2.${parts.slice(1).join('.')}`;
                } else {
                    // No namespace: name -> name_2
                    renamedWorkflowAlias = `${alias}_2`;
                }
                return {
                    originalWorkflowAlias: alias,
                    originalSnipAlias: alias,
                    resolvedWorkflowAlias: renamedWorkflowAlias,
                    resolvedSnipAlias: alias, // Snip wins by default
                };
            });
            setItems(initialItems);
        }
    }, [collisions]);

    const validate = (): boolean => {
        const newErrors: Record<number, string> = {};
        const allResolvedAliases = new Set<string>();

        items.forEach((item, idx) => {
            // Check for empty aliases
            if (!item.resolvedWorkflowAlias.trim()) {
                newErrors[idx] = "Workflow alias cannot be empty";
            }
            if (!item.resolvedSnipAlias.trim()) {
                newErrors[idx] = "Snip alias cannot be empty";
            }

            // Check for invalid characters (basic check)
            const validPattern = /^[a-zA-Z0-9_.]+$/;
            if (!validPattern.test(item.resolvedWorkflowAlias)) {
                newErrors[idx] = "Workflow alias contains invalid characters";
            }
            if (!validPattern.test(item.resolvedSnipAlias)) {
                newErrors[idx] = "Snip alias contains invalid characters";
            }

            // Check for duplicates
            if (allResolvedAliases.has(item.resolvedWorkflowAlias)) {
                newErrors[idx] = "Duplicate alias in resolution";
            }
            if (allResolvedAliases.has(item.resolvedSnipAlias)) {
                newErrors[idx] = "Duplicate alias in resolution";
            }

            allResolvedAliases.add(item.resolvedWorkflowAlias);
            allResolvedAliases.add(item.resolvedSnipAlias);
        });

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleWorkflowAliasChange = (idx: number, value: string): void => {
        const newItems = [...items];
        newItems[idx].resolvedWorkflowAlias = value;
        setItems(newItems);
    };

    const handleSnipAliasChange = (idx: number, value: string): void => {
        const newItems = [...items];
        newItems[idx].resolvedSnipAlias = value;
        setItems(newItems);
    };

    return {
        items,
        errors,
        validate,
        handleWorkflowAliasChange,
        handleSnipAliasChange
    };
}
