# Shared Components Library

**Last Updated:** 2025-10-14

This document provides a reference for all shared components in Vault-Logic. These components promote consistency, reduce code duplication, and follow the DRY (Don't Repeat Yourself) principle.

---

## UI Foundation Components

### StatCard
**Location:** `client/src/components/shared/StatCard.tsx`

Display key metrics with icons and optional change indicators.

**Props:**
```typescript
interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;        // e.g., "text-primary"
  iconBgColor?: string;       // e.g., "bg-primary/10"
  change?: string;            // e.g., "12% from last month"
  changeLabel?: string;       // e.g., "increase"
  isLoading?: boolean;
}
```

**Example:**
```tsx
<StatCard
  title="Total Surveys"
  value={42}
  icon={FileText}
  iconColor="text-primary"
  change="5 new this week"
  isLoading={false}
/>
```

**Used in:** Dashboard overview stats, RecipientStats

---

### EmptyState
**Location:** `client/src/components/shared/EmptyState.tsx`

Consistent empty state displays with icon, title, description, and optional action.

**Props:**
```typescript
interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  fullPage?: boolean;        // Center in full viewport
}
```

**Example:**
```tsx
<EmptyState
  icon={Users}
  title="No recipients yet"
  description="Add recipients to start distributing your survey"
  action={<Button onClick={handleAdd}>Add Recipients</Button>}
/>
```

**Used in:** QuestionEditorPanel, ErrorScreen

---

### LoadingState
**Location:** `client/src/components/shared/LoadingState.tsx`

Flexible loading spinner with configurable size and optional message.

**Props:**
```typescript
interface LoadingStateProps {
  size?: "sm" | "md" | "lg";  // Default: "md"
  message?: string;
  fullPage?: boolean;          // Center in full viewport
}
```

**Example:**
```tsx
<LoadingState size="lg" message="Loading survey data..." fullPage />
```

**Used in:** LoadingScreen, various loading states

---

## Skeleton Loaders

### SkeletonCard
**Location:** `client/src/components/shared/SkeletonCard.tsx`

Loading placeholder for card grids.

**Props:**
```typescript
interface SkeletonCardProps {
  count?: number;             // Default: 1
  height?: string;            // Default: "h-48"
  className?: string;
}
```

**Example:**
```tsx
<SkeletonCard count={6} height="h-48" />
```

**Used in:** SurveysList loading state

---

### SkeletonList
**Location:** `client/src/components/shared/SkeletonList.tsx`

Loading placeholder for list items.

**Props:**
```typescript
interface SkeletonListProps {
  count?: number;             // Default: 3
  itemHeight?: string;        // Default: "h-20"
  showAvatar?: boolean;       // Default: false
}
```

**Example:**
```tsx
<SkeletonList count={5} showAvatar />
```

**Used in:** Dashboard recent surveys, Recipients lists

---

### SkeletonTable
**Location:** `client/src/components/shared/SkeletonTable.tsx`

Loading placeholder for tables.

**Props:**
```typescript
interface SkeletonTableProps {
  rows?: number;              // Default: 5
  columns?: number;           // Default: 4
}
```

**Example:**
```tsx
<SkeletonTable rows={10} columns={7} />
```

**Used in:** Analytics tables loading states

---

## Dialog Components

### ConfirmationDialog
**Location:** `client/src/components/shared/ConfirmationDialog.tsx`

Reusable confirmation dialog with destructive variant support.

**Props:**
```typescript
interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;       // Default: "Confirm"
  cancelText?: string;        // Default: "Cancel"
  variant?: "default" | "destructive";
  onConfirm: () => void;
  isPending?: boolean;
  testId?: string;
}
```

**Example:**
```tsx
<ConfirmationDialog
  open={isOpen}
  onOpenChange={setIsOpen}
  title="Delete Selected Recipients"
  description={`Are you sure you want to delete ${count} recipients?`}
  confirmText="Delete"
  variant="destructive"
  onConfirm={handleDelete}
  isPending={isDeleting}
/>
```

**Used in:** BulkDeleteDialog, SendInvitationsDialog

---

## Badge Components

### StatusBadge
**Location:** `client/src/components/shared/StatusBadge.tsx`

Standardized survey status badges with color variants.

**Props:**
```typescript
interface StatusBadgeProps {
  status: "draft" | "open" | "closed";
}
```

**Example:**
```tsx
<StatusBadge status={survey.status} />
```

**Renders:**
- `draft` → Yellow badge with "Draft" label
- `open` → Green badge with "Active" label
- `closed` → Gray badge with "Closed" label

**Used in:** SurveysList, Dashboard

---

## Analytics Components

### ChartEmptyState
**Location:** `client/src/components/shared/ChartEmptyState.tsx`

Consistent empty state for analytics charts.

**Props:**
```typescript
interface ChartEmptyStateProps {
  icon: LucideIcon;
  message: string;
  height?: string;            // Default: "h-64"
}
```

**Example:**
```tsx
<ChartEmptyState
  icon={BarChart3}
  message="No analytics data available"
  height="h-96"
/>
```

**Used in:** All analytics tab components (OverviewTab, QuestionsTab, FunnelTab, TimeAnalysisTab, EngagementTab)

---

### DataTable
**Location:** `client/src/components/shared/DataTable.tsx`

Generic table component with flexible column configuration.

**Props:**
```typescript
interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => ReactNode);
  align?: "left" | "center" | "right";
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  emptyState?: ReactNode;
  className?: string;
  getRowKey: (row: T) => string;
}
```

**Example:**
```tsx
<DataTable
  data={questionAnalytics}
  columns={[
    { header: "Question", accessor: "questionTitle", align: "left" },
    {
      header: "Type",
      accessor: (row) => <Badge>{row.questionType}</Badge>,
      align: "left"
    },
    { header: "Views", accessor: "totalViews", align: "right" }
  ]}
  getRowKey={(row) => row.questionId}
  emptyState={<p>No data available</p>}
/>
```

**Used in:** QuestionsTab (question performance table)

---

## Navigation Components

### QuickActionButton
**Location:** `client/src/components/shared/QuickActionButton.tsx`

Consistent quick action button with icon, label, and navigation.

**Props:**
```typescript
interface QuickActionButtonProps {
  href?: string;              // For navigation (uses Link)
  onClick?: () => void;       // For actions
  icon: LucideIcon;
  iconColor?: string;         // Default: "text-primary"
  iconBgColor?: string;       // Default: "bg-primary/10"
  label: string;
  testId?: string;
}
```

**Example:**
```tsx
<QuickActionButton
  href="/surveys/new"
  icon={Plus}
  iconColor="text-primary"
  iconBgColor="bg-primary/10"
  label="Create New Survey"
/>

<QuickActionButton
  onClick={handleExport}
  icon={Download}
  iconColor="text-warning"
  iconBgColor="bg-warning/10"
  label="Export Data"
/>
```

**Used in:** Dashboard quick actions section

---

## Usage Guidelines

### When to Create a New Shared Component

Create a shared component when you notice:
1. **3+ duplicates** of the same pattern
2. **Consistent interface** across all usages
3. **High reuse potential** for future features
4. **Clear abstraction** that doesn't over-complicate

### When NOT to Create a Shared Component

Avoid creating a shared component when:
- Pattern is used in only 1-2 places
- Each usage requires significant customization
- Abstraction would be more complex than duplication
- Pattern is highly feature-specific

---

## Component Inventory

**Total Shared Components:** 11

**By Category:**
- UI Foundation: 3 (StatCard, EmptyState, LoadingState)
- Skeleton Loaders: 3 (SkeletonCard, SkeletonList, SkeletonTable)
- Dialogs: 1 (ConfirmationDialog)
- Badges: 1 (StatusBadge)
- Analytics: 2 (ChartEmptyState, DataTable)
- Navigation: 1 (QuickActionButton)

**Impact:**
- ~700 lines of duplicate code eliminated
- 20+ components refactored
- Consistent patterns across entire application

---

## Related Files

- **Layout Components:** `client/src/components/layout/Header.tsx`, `Sidebar.tsx`
- **UI Components:** `client/src/components/ui/*` (Radix UI wrappers)
- **Feature Components:** `client/src/features/*/components/*`

---

**Document Version:** 1.0
**Maintained By:** Development Team
