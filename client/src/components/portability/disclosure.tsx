import { AlertTriangle, FileWarning, KeyRound, Link2Off } from "lucide-react";

/**
 * Presentational pieces shared by the export disclosure (IEX3-4) and the
 * import preview (IEX3-5).
 *
 * Both screens answer the same question from opposite ends — "what is in this
 * bundle, and what will it cost me?" — off the same two shapes,
 * `manifest.warnings[]` and `manifest.requiresReentry[]`. Rendering them twice
 * would guarantee the two screens eventually disagreed about what a
 * `dangling_reference` means, which is precisely the kind of drift that makes
 * a security disclosure untrustworthy.
 */

/** Mirrors the `warnings` union in `server/services/portability/bundleFormat.ts`. */
export interface ManifestWarning {
  type: "missing_blob" | "secret_scan" | "dangling_reference" | "schema_drift";
  entity?: string;
  column?: string;
  line?: number;
  missingId?: string;
  fileRef?: string;
  message: string;
}

export interface RequiresReentryEntry {
  type: "secret" | "connection";
  key?: string;
  secretType?: string;
  environment?: string | null;
  connectionName?: string;
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

/** "secret · production" / "secret" / "connection". */
export function describeReentry(entry: RequiresReentryEntry): string {
  if (entry.type !== "secret") {
    return "connection";
  }
  return entry.environment != null ? `secret · ${entry.environment}` : "secret";
}

/**
 * A bordered callout. `tone` is the only visual dial: amber for something the
 * user should act on, muted for something they should merely know.
 */
export function Callout({
  tone,
  icon,
  title,
  children,
  labelId,
}: {
  tone: "warn" | "muted";
  icon: typeof AlertTriangle;
  title: string;
  children: React.ReactNode;
  labelId: string;
}) {
  const Icon = icon;
  const toneClasses =
    tone === "warn"
      ? "border-amber-500/40 bg-amber-500/5"
      : "border-border bg-muted/30";
  const iconClasses =
    tone === "warn" ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground";

  return (
    <section className={`rounded-md border p-4 ${toneClasses}`} aria-labelledby={labelId}>
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClasses}`} aria-hidden="true" />
        <div className="min-w-0 space-y-2">
          <h3 id={labelId} className="text-sm font-semibold">
            {title}
          </h3>
          {children}
        </div>
      </div>
    </section>
  );
}

/** Secrets and connections the bundle withheld, named so they can be re-entered. */
export function ReentryList({ entries }: { entries: RequiresReentryEntry[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {entries.map((entry, i) => (
        <li key={i} className="flex items-baseline gap-2">
          <span className="font-mono text-xs">
            {entry.type === "secret" ? entry.key : entry.connectionName}
          </span>
          <span className="text-xs text-muted-foreground">{describeReentry(entry)}</span>
        </li>
      ))}
    </ul>
  );
}

/** One line per warning, identifying *where* rather than restating the message. */
export function WarningLine({ warning }: { warning: ManifestWarning }) {
  switch (warning.type) {
    case "secret_scan":
      return (
        <span className="font-mono text-xs">
          {warning.entity}.{warning.column} — line {warning.line}
        </span>
      );
    case "dangling_reference":
      return (
        <span className="font-mono text-xs">
          {warning.entity}.{warning.column} → {warning.missingId}
        </span>
      );
    case "missing_blob":
      return <span className="font-mono text-xs">{warning.fileRef}</span>;
    default:
      return <span className="text-xs">{warning.message}</span>;
  }
}

export const WARNING_ICONS = {
  secret_scan: AlertTriangle,
  dangling_reference: Link2Off,
  missing_blob: FileWarning,
  schema_drift: FileWarning,
  reentry: KeyRound,
} as const;
