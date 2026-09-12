import { describe, it, expect, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import { CuratedCatalogProvider } from "../../../../server/lib/templates/CuratedCatalogProvider";
import { logger } from "../../../../server/logger";

const tmpDirs: string[] = [];

function makeTmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ezb-curated-catalog-"));
    tmpDirs.push(dir);
    return dir;
}

function writeIndex(dir: string, entries: unknown[]): string {
    const indexPath = path.join(dir, "index.json");
    fs.writeFileSync(indexPath, JSON.stringify(entries, null, 2));
    return indexPath;
}

afterEach(() => {
    while (tmpDirs.length > 0) {
        const dir = tmpDirs.pop();
        if (dir) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }
    vi.restoreAllMocks();
});

const SAMPLE_ENTRIES = [
    {
        slug: "nda",
        title: "Mutual NDA",
        description: "Collects both parties and generates an NDA.",
        category: "legal",
        tags: ["nda", "confidentiality"],
        bundlePath: "nda.ezb",
    },
    {
        slug: "retainer-agreement",
        title: "Retainer Agreement",
        description: "Collects the client and rate.",
        category: "legal",
        tags: ["retainer", "billing"],
        bundlePath: "retainer-agreement.ezb",
    },
    {
        slug: "intake-questionnaire",
        title: "New Client Intake Questionnaire",
        description: "A general new-matter intake.",
        category: "legal",
        tags: ["intake", "client-onboarding"],
        bundlePath: "intake-questionnaire.ezb",
    },
];

describe("CuratedCatalogProvider (TM-2)", () => {
    it("lists every entry from the generated index as a CatalogTemplate", async () => {
        const dir = makeTmpDir();
        const indexPath = writeIndex(dir, SAMPLE_ENTRIES);
        const provider = new CuratedCatalogProvider(indexPath);

        const templates = await provider.listTemplates({});

        expect(templates).toHaveLength(3);
        expect(templates.map((t) => t.id).sort()).toEqual(
            ["intake-questionnaire", "nda", "retainer-agreement"]
        );
        const nda = templates.find((t) => t.id === "nda");
        expect(nda).toEqual({
            id: "nda",
            title: "Mutual NDA",
            description: "Collects both parties and generates an NDA.",
            category: "legal",
            tags: ["nda", "confidentiality"],
        });
    });

    it("gets a single entry by id, and returns null for an unknown id", async () => {
        const dir = makeTmpDir();
        const indexPath = writeIndex(dir, SAMPLE_ENTRIES);
        const provider = new CuratedCatalogProvider(indexPath);

        const found = await provider.getTemplate("retainer-agreement");
        expect(found?.title).toBe("Retainer Agreement");

        const missing = await provider.getTemplate("does-not-exist");
        expect(missing).toBeNull();
    });

    it("filters by category, case-insensitively", async () => {
        const dir = makeTmpDir();
        const indexPath = writeIndex(dir, [
            ...SAMPLE_ENTRIES,
            {
                slug: "hr-onboarding",
                title: "HR Onboarding",
                description: "Onboard a new employee.",
                category: "hr",
                tags: ["onboarding"],
                bundlePath: "hr-onboarding.ezb",
            },
        ]);
        const provider = new CuratedCatalogProvider(indexPath);

        const legal = await provider.listTemplates({ category: "LEGAL" });
        expect(legal.map((t) => t.id).sort()).toEqual(
            ["intake-questionnaire", "nda", "retainer-agreement"]
        );

        const hr = await provider.listTemplates({ category: "hr" });
        expect(hr.map((t) => t.id)).toEqual(["hr-onboarding"]);
    });

    it("filters by search across title, description and tags, case-insensitively", async () => {
        const dir = makeTmpDir();
        const indexPath = writeIndex(dir, SAMPLE_ENTRIES);
        const provider = new CuratedCatalogProvider(indexPath);

        const byTitle = await provider.listTemplates({ search: "NDA" });
        expect(byTitle.map((t) => t.id)).toEqual(["nda"]);

        const byTag = await provider.listTemplates({ search: "billing" });
        expect(byTag.map((t) => t.id)).toEqual(["retainer-agreement"]);

        const byDescription = await provider.listTemplates({ search: "new-matter" });
        expect(byDescription.map((t) => t.id)).toEqual(["intake-questionnaire"]);
    });

    it("returns an empty list for a search with no matches", async () => {
        const dir = makeTmpDir();
        const indexPath = writeIndex(dir, SAMPLE_ENTRIES);
        const provider = new CuratedCatalogProvider(indexPath);

        const noMatch = await provider.listTemplates({ search: "no-such-template-exists" });
        expect(noMatch).toEqual([]);
    });

    it("degrades to an empty catalog (not a throw) when the index file does not exist, and logs loudly", async () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
        const dir = makeTmpDir();
        const missingPath = path.join(dir, "does-not-exist", "index.json");
        const provider = new CuratedCatalogProvider(missingPath);

        await expect(provider.listTemplates({})).resolves.toEqual([]);
        await expect(provider.getTemplate("nda")).resolves.toBeNull();
        expect(errorSpy).toHaveBeenCalled();
    });

    it("degrades to an empty catalog when the index file is not valid JSON, and logs loudly", async () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
        const dir = makeTmpDir();
        const indexPath = path.join(dir, "index.json");
        fs.writeFileSync(indexPath, "{ not valid json");
        const provider = new CuratedCatalogProvider(indexPath);

        await expect(provider.listTemplates({})).resolves.toEqual([]);
        expect(errorSpy).toHaveBeenCalled();
    });

    it("degrades to an empty catalog when the index file does not match the expected shape, and logs loudly", async () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
        const dir = makeTmpDir();
        const indexPath = writeIndex(dir, [{ slug: "nda" /* missing everything else */ }]);
        const provider = new CuratedCatalogProvider(indexPath);

        await expect(provider.listTemplates({})).resolves.toEqual([]);
        expect(errorSpy).toHaveBeenCalled();
    });

    // TM-3: MarketplaceService.installTemplate feeds this straight to
    // ImportService, so it must resolve to a real, absolute path next to
    // the index - not one relative to process.cwd().
    it("resolves a bundle's path relative to the index file's own directory, and null for an unknown id", async () => {
        const dir = makeTmpDir();
        const indexPath = writeIndex(dir, SAMPLE_ENTRIES);
        const provider = new CuratedCatalogProvider(indexPath);

        const bundlePath = await provider.getBundlePath("nda");
        expect(bundlePath).toBe(path.resolve(dir, "nda.ezb"));

        const missing = await provider.getBundlePath("does-not-exist");
        expect(missing).toBeNull();
    });
});
