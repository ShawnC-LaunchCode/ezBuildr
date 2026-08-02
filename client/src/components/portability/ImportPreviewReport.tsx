import { AlertTriangle, CheckCircle2, KeyRound, ShieldAlert } from "lucide-react";
import {
  Callout,
  ReentryList,
  SectionHeading,
  WarningLine,
  type ManifestWarning,
  type RequiresReentryEntry,
} from "@/components/portability/disclosure";

/**
 * Everything the import preview has to say about a bundle, in severity order
 * (IEX3-5).
 *
 * Split out of `ImportWorkflow` so the page stays orchestration — upload,
 * apply, navigate — and this stays presentation. The order of the sections is
 * the design and should not be rearranged casually: executable code, then
 * things that cannot be undone by editing later, then the merely
 * informational.
 */

export interface ImportCollision {
  entity: string;
  name: string;
  type: "workflow" | "project" | "table_slug" | "step_alias";
}

export interface ImportPreviewData {
  canProceed: boolean;
  entityCounts: Record<string, number>;
  collisions: ImportCollision[];
  requiresReentry: RequiresReentryEntry[];
  hasExecutableCode: boolean;
  warnings: ManifestWarning[];
  errors: string[];
}

const COLLISION_LABELS: Record<ImportCollision["type"], string> = {
  workflow: "Workflow name already in use",
  project: "Project name already in use",
  table_slug: "DataVault table slug already in use",
  step_alias: "Duplicate question alias inside the bundle",
};

const ENTITY_LABELS: Record<string, string> = {
  workflows: "Workflow", sections: "Pages", steps: "Questions",
  logic_rules: "Logic rules", blocks: "Blocks", transform_blocks: "Transform blocks",
  lifecycle_hooks: "Lifecycle hooks", document_hooks: "Document hooks",
  workflow_versions: "Versions", templates: "Document templates",
  template_versions: "Template versions", workflow_templates: "Template links",
  datavault_databases: "DataVault databases", datavault_tables: "DataVault tables",
  datavault_columns: "DataVault columns", datavault_rows: "DataVault rows",
  datavault_values: "DataVault values", workflow_queries: "Saved queries",
  workflow_data_sources: "Data source links", projects: "Project",
  secrets: "Secret names", connections: "Connections",
};

/** The entity types whose presence means code will execute in this tenant. */
const EXECUTABLE_ENTITIES: Array<[string, string]> = [
  ["transform_blocks", "transform blocks"],
  ["lifecycle_hooks", "lifecycle hooks"],
  ["document_hooks", "document hooks"],
];

function labelFor(entity: string): string {
  return ENTITY_LABELS[entity] ?? entity.replace(/_/g, " ");
}

/** "a, b and c" — an Oxford-less list reads as prose, not as debug output. */
function joinPhrases(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function BlockedCallout({ errors }: { errors: string[] }) {
  return (
    <Callout
      tone="warn"
      icon={ShieldAlert}
      labelId="import-errors"
      title="This bundle cannot be imported"
    >
      <ul className="space-y-1 text-sm text-muted-foreground">
        {errors.map((error, i) => (
          <li key={i}>{error}</li>
        ))}
      </ul>
    </Callout>
  );
}

function ExecutableCallout({ counts }: { counts: Record<string, number> }) {
  const present = EXECUTABLE_ENTITIES.filter(([key]) => (counts[key] ?? 0) > 0);
  return (
    <Callout
      tone="warn"
      icon={AlertTriangle}
      labelId="import-executable"
      title="This bundle contains code that will run in your workspace"
    >
      <p className="text-sm text-muted-foreground">
        It carries{" "}
        {present.length > 0
          ? joinPhrases(present.map(([, label]) => label))
          : "executable scripts"}
        . These execute JavaScript or Python with access to run data. Only import bundles from a
        source you trust.
      </p>
    </Callout>
  );
}

function CollisionSection({ collisions }: { collisions: ImportCollision[] }) {
  return (
    <section className="space-y-2" aria-labelledby="import-collisions">
      <SectionHeading>
        <span id="import-collisions">Names that already exist here</span>
      </SectionHeading>
      <p className="text-sm text-muted-foreground">
        The import will still create these — you will have two with the same name.
      </p>
      <ul className="space-y-1 text-sm">
        {collisions.map((collision, i) => (
          <li key={i} className="flex items-baseline gap-2">
            <span className="font-mono text-xs">{collision.name}</span>
            <span className="text-xs text-muted-foreground">
              {COLLISION_LABELS[collision.type]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReentrySection({ entries }: { entries: RequiresReentryEntry[] }) {
  return (
    <section className="space-y-2" aria-labelledby="import-reentry">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <SectionHeading>
          <span id="import-reentry">You will need to re-enter these</span>
        </SectionHeading>
      </div>
      <p className="text-sm text-muted-foreground">
        Secret values are never included in a bundle. The workflow will not run correctly until
        you supply them in the project&apos;s settings.
      </p>
      <ReentryList entries={entries} />
    </section>
  );
}

export function ImportPreviewReport({
  preview,
  errorRef,
}: {
  preview: ImportPreviewData;
  /** Focus target when the bundle cannot be applied; see the page's effect. */
  errorRef: React.Ref<HTMLDivElement>;
}) {
    const counts = Object.entries(preview.entityCounts).filter(([, n]) => n > 0);
    const nothingToFlag =
      preview.canProceed &&
      !preview.hasExecutableCode &&
      preview.collisions.length === 0 &&
      preview.warnings.length === 0 &&
      preview.requiresReentry.length === 0;

    return (
      <>
        {!preview.canProceed && (
          <div ref={errorRef} tabIndex={-1} className="outline-none">
            <BlockedCallout errors={preview.errors} />
          </div>
        )}

        {preview.hasExecutableCode && <ExecutableCallout counts={preview.entityCounts} />}

        {preview.collisions.length > 0 && (
          <CollisionSection collisions={preview.collisions} />
        )}

        {preview.warnings.length > 0 && (
          <section className="space-y-2" aria-labelledby="import-warnings">
            <SectionHeading>
              <span id="import-warnings">References that will not resolve</span>
            </SectionHeading>
            <ul className="space-y-1 text-sm">
              {preview.warnings.map((w, i) => (
                <li key={i}>
                  <WarningLine warning={w} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {preview.requiresReentry.length > 0 && (
          <ReentrySection entries={preview.requiresReentry} />
        )}

        {nothingToFlag && (
          <Callout tone="muted" icon={CheckCircle2} labelId="import-clean" title="Nothing to flag">
            <p className="text-sm text-muted-foreground">
              No name clashes, no executable code, no unresolved references and no secrets to
              re-enter. This bundle will import cleanly.
            </p>
          </Callout>
        )}

        <section className="space-y-2" aria-labelledby="import-contents">
          <SectionHeading>
            <span id="import-contents">What will be created</span>
          </SectionHeading>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {counts.map(([entity, count]) => (
              <div key={entity} className="flex items-baseline justify-between gap-2">
                <dt className="truncate text-muted-foreground">{labelFor(entity)}</dt>
                <dd className="font-mono tabular-nums">{count}</dd>
              </div>
            ))}
          </dl>
        </section>
      </>
    );
}
