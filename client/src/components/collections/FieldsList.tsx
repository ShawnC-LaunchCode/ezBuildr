/**
 * FieldsList Component
 * Displays list of fields in a collection with edit/delete actions
 */

import { Pencil, Trash2, Type, Hash, ToggleLeft, Calendar, FileIcon, List, Braces } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ApiCollectionField } from "@/lib/vault-api";

interface FieldsListProps {
  fields: ApiCollectionField[];
  onEdit?: (field: ApiCollectionField) => void;
  onDelete?: (fieldId: string) => void;
}

const FIELD_TYPE_ICONS = {
  text: Type,
  number: Hash,
  boolean: ToggleLeft,
  date: Calendar,
  datetime: Calendar,
  file: FileIcon,
  select: List,
  multi_select: List,
  json: Braces,
};

const FIELD_TYPE_COLORS = {
  text: 'bg-blue-500/10 text-blue-600',
  number: 'bg-green-500/10 text-green-600',
  boolean: 'bg-purple-500/10 text-purple-600',
  date: 'bg-orange-500/10 text-orange-600',
  datetime: 'bg-orange-500/10 text-orange-600',
  file: 'bg-pink-500/10 text-pink-600',
  select: 'bg-indigo-500/10 text-indigo-600',
  multi_select: 'bg-indigo-500/10 text-indigo-600',
  json: 'bg-gray-500/10 text-gray-600',
};

export function FieldsList({ fields, onEdit, onDelete }: FieldsListProps) {
  if (fields.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            No fields yet. Add your first field to define the structure.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {fields.map((field) => {
        const Icon = FIELD_TYPE_ICONS[field.type] || Type;
        const colorClass = FIELD_TYPE_COLORS[field.type] || 'bg-gray-500/10 text-gray-600';

        return (
          <Card key={field.id} className="hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className={`p-2 rounded-lg ${colorClass}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{field.name}</h3>
                      {field.isRequired && (
                        <Badge variant="destructive" className="text-xs">Required</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs bg-muted px-2 py-0.5 rounded">{field.slug}</code>
                      <Badge variant="secondary" className="text-xs capitalize">
                        {field.type.replace('_', ' ')}
                      </Badge>
                    </div>

                    {/* Options for select/multi-select */}
                    {field.options && Array.isArray(field.options) && field.options.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground mb-1">Options:</p>
                        <div className="flex flex-wrap gap-1">
                          {field.options.map((option, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {option}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Default value */}
                    {field.defaultValue !== null && field.defaultValue !== undefined && (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground">
                          Default: <span className="font-mono">{String(field.defaultValue)}</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {onEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(field)}
                      title="Edit field"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                  {onDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(field.id)}
                      title="Delete field"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
