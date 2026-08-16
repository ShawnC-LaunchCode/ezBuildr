import * as fs from "fs";
import * as path from "path";

import { logger } from "../../logger";

import type { CatalogTemplate, TemplateCatalog, TemplateCatalogListParams } from "./TemplateCatalog";

/** Mirrors `MarketplaceIndexEntry` in `scripts/generateMarketplaceBundles.ts` (TM-1). */
interface MarketplaceIndexEntry {
    slug: string;
    title: string;
    description: string | null;
    category: string;
    tags: string[];
    bundlePath: string;
}

function isMarketplaceIndexEntry(value: unknown): value is MarketplaceIndexEntry {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const entry = value as Record<string, unknown>;
    return (
        typeof entry.slug === "string" &&
        typeof entry.title === "string" &&
        (typeof entry.description === "string" || entry.description === null) &&
        typeof entry.category === "string" &&
        Array.isArray(entry.tags) &&
        entry.tags.every((tag) => typeof tag === "string")
    );
}

/**
 * Does `needle` begin a word anywhere in `haystack`? Both are already
 * lower-cased by the caller.
 *
 * A plain `haystack.includes(needle)` is too loose for a gallery search: a user
 * typing "NDA" also matched the retainer template, because its description
 * contains "cale**nda**r". Anchoring to a word start fixes that without
 * demanding a whole-word match, so search-as-you-type still works — "retain"
 * finds "retainer", "confidential" finds "confidentiality".
 */
function matchesWholeWord(haystack: string, needle: string): boolean {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}`, "u").test(haystack);
}

/**
 * Path to TM-1's generated index, resolved the same way
 * `getMigrationHead`/`ExportService` resolve repo-root paths: `process.cwd()`
 * is the repo root both at server runtime and under Vitest, which is why
 * that pattern is safe to reuse here (`migrationHead.ts`).
 */
function defaultIndexPath(): string {
    return path.resolve(process.cwd(), "dist/marketplace/index.json");
}

/**
 * Serves the curated marketplace catalog from TM-1's build-time generated
 * `dist/marketplace/index.json` — never from `templates/curated` directly.
 * That source tree is not copied into the production image (`Dockerfile:
 * 81-100`), so reading it at runtime would silently serve an empty gallery
 * in production while looking fine in local dev, where the tree is always
 * present. See TM-1's header comment for the full rationale.
 *
 * `dist/` is a gitignored build artifact, so the index will not exist:
 *   - on a fresh clone before the first `npm run build` (which runs
 *     `build:marketplace`), and
 *   - under a plain `npm run dev`, which never invokes the generator.
 * Both are ordinary states, not startup failures, so this provider must
 * never throw at construction or crash a request path that doesn't touch
 * the marketplace. Reading is therefore lazy — done on every call, never at
 * import time — and a missing or malformed index degrades to an empty
 * catalog rather than a crash. That degradation is logged loudly (an `error`
 * naming the exact fix) on every call rather than silently once, so an
 * undeployed marketplace surfaces in logs instead of reproducing the "empty
 * gallery forever" bug this initiative exists to close.
 */
export class CuratedCatalogProvider implements TemplateCatalog {
    constructor(private readonly indexPath: string = defaultIndexPath()) {}

    private readIndex(): MarketplaceIndexEntry[] {
        let raw: string;
        try {
            raw = fs.readFileSync(this.indexPath, "utf8");
        } catch (error) {
            logger.error(
                { error, indexPath: this.indexPath },
                "CuratedCatalogProvider: dist/marketplace/index.json not found. Run `npm run " +
                    "build:marketplace` (or `npm run build`) to generate the marketplace catalog. " +
                    "Serving an empty catalog until it exists."
            );
            return [];
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            logger.error(
                { error, indexPath: this.indexPath },
                "CuratedCatalogProvider: dist/marketplace/index.json is not valid JSON. Regenerate it " +
                    "with `npm run build:marketplace`. Serving an empty catalog until it is fixed."
            );
            return [];
        }

        if (!Array.isArray(parsed) || !parsed.every(isMarketplaceIndexEntry)) {
            logger.error(
                { indexPath: this.indexPath },
                "CuratedCatalogProvider: dist/marketplace/index.json does not match the expected " +
                    "shape. Regenerate it with `npm run build:marketplace`. Serving an empty catalog " +
                    "until it is fixed."
            );
            return [];
        }

        return parsed;
    }

    private toCatalogTemplate(entry: MarketplaceIndexEntry): CatalogTemplate {
        return {
            id: entry.slug,
            title: entry.title,
            description: entry.description ?? "",
            category: entry.category,
            tags: entry.tags,
        };
    }

    async listTemplates(params: TemplateCatalogListParams): Promise<CatalogTemplate[]> {
        const category = params.category?.trim().toLowerCase();
        const search = params.search?.trim().toLowerCase();

        return this.readIndex()
            .filter((entry) => {
                if (category !== undefined && category !== "" && entry.category.toLowerCase() !== category) {
                    return false;
                }
                if (search !== undefined && search !== "") {
                    const haystack = [entry.title, entry.description ?? "", ...entry.tags]
                        .join(" ")
                        .toLowerCase();
                    if (!matchesWholeWord(haystack, search)) {
                        return false;
                    }
                }
                return true;
            })
            .map((entry) => this.toCatalogTemplate(entry));
    }

    async getTemplate(id: string): Promise<CatalogTemplate | null> {
        const found = this.readIndex().find((entry) => entry.slug === id);
        return found ? this.toCatalogTemplate(found) : null;
    }
}

export const curatedCatalogProvider = new CuratedCatalogProvider();
