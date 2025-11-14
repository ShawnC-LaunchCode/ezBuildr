/**
 * CollectionCard Component
 * Displays a collection data table card with stats
 */

import { Database, Trash2, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EntityCard, type EntityAction } from "@/components/shared/EntityCard";
import type { ApiCollectionWithStats } from "@/lib/vault-api";

interface CollectionCardProps {
  collection: ApiCollectionWithStats;
  onClick?: (collection: ApiCollectionWithStats) => void;
  onEdit?: (collection: ApiCollectionWithStats) => void;
  onDelete?: (id: string) => void;
}

export function CollectionCard({ collection, onClick, onEdit, onDelete }: CollectionCardProps) {
  const actions: EntityAction[] = [];

  if (onEdit) {
    actions.push({
      label: "Edit",
      icon: Pencil,
      onClick: () => onEdit(collection),
    });
  }

  if (onDelete) {
    actions.push({
      label: "Delete",
      icon: Trash2,
      onClick: () => onDelete(collection.id),
      variant: "destructive",
      separator: true,
    });
  }

  return (
    <EntityCard
      entity={{
        ...collection,
        title: collection.name,
      }}
      icon={Database}
      iconClassName="bg-blue-500/10 text-blue-600"
      onClick={onClick}
      actions={actions}
      renderBadge={() => (
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {collection.fieldCount} {collection.fieldCount === 1 ? 'field' : 'fields'}
          </Badge>
          <Badge variant="outline">
            {collection.recordCount} {collection.recordCount === 1 ? 'record' : 'records'}
          </Badge>
        </div>
      )}
    />
  );
}
