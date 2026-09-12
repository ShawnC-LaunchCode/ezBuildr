/**
 * Categorized, icon-per-type palette for choosing a List field's question
 * type (LIST2-1) — used both to add a new field and to change an existing
 * one's type, so the two actions look identical.
 *
 * Donor pattern: `QuestionAddMenu` (builder/pages/QuestionAddMenu.tsx). This
 * component does not share code with it because a list field is not a step
 * row (Decision 1; the List ticket files are retired — see
 * tickets/backlog/LIST.md) — selecting an entry here only calls `onSelect`,
 * never `useCreateStep`.
 */
import type { ReactElement } from "react";

import { QuestionTypeIcon } from "@/components/shared/QuestionTypeIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/blockRegistry";

import {
  getListFieldPaletteByCategory,
  NESTED_LIST_TYPE_VALUE,
  type ListFieldTypeSelection,
} from "./listEditorHelpers";

interface ListFieldTypeMenuProps {
  /** The element that opens the menu (rendered via DropdownMenuTrigger asChild). */
  trigger: ReactElement;
  align?: "start" | "end";
  /** Whether the "Nested List" entry should render disabled at this level/field. */
  nestedListDisabled: boolean;
  onSelect: (type: ListFieldTypeSelection) => void;
}

export function ListFieldTypeMenu({ trigger, align = "start", nestedListDisabled, onSelect }: ListFieldTypeMenuProps) {
  const blocksByCategory = getListFieldPaletteByCategory();
  const orderedCategories = CATEGORY_ORDER.filter(
    (category) => (blocksByCategory[category]?.length ?? 0) > 0
  );
  const categoryColumns = [
    orderedCategories.filter((_, index) => index % 2 === 0),
    orderedCategories.filter((_, index) => index % 2 === 1),
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-[36rem] max-w-[calc(100vw-2rem)] p-2">
        <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-2">
          {categoryColumns.map((categories, columnIndex) => (
            <div key={columnIndex} data-testid="question-category-column" className="flex min-w-0 flex-col gap-2">
              {categories.map((category) => (
                <div key={category} className="min-w-0 rounded-md border border-border/60 p-1">
                  <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    {CATEGORY_LABELS[category]}
                  </DropdownMenuLabel>
                  {blocksByCategory[category]?.map((entry) => (
                    <DropdownMenuItem
                      key={entry.value}
                      disabled={entry.value === NESTED_LIST_TYPE_VALUE && nestedListDisabled}
                      onClick={() => onSelect(entry.value)}
                      className="cursor-pointer gap-2.5 py-1.5"
                    >
                      <QuestionTypeIcon
                        type={entry.iconType}
                        presentation={entry.presentation}
                        size="md"
                      />
                      <div className="min-w-0 flex flex-col">
                        <span>{entry.label}</span>
                        {entry.description !== undefined && (
                          <span className="text-xs text-muted-foreground">{entry.description}</span>
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
