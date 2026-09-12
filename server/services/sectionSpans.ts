import type { Page, Section } from "@shared/schema";

export class SectionLayoutError extends Error {
  readonly statusCode: 400 | 409;

  constructor(message: string, statusCode: 400 | 409 = 400) {
    super(message);
    this.name = "SectionLayoutError";
    this.statusCode = statusCode;
  }
}

type SpanPage = Pick<Page, "id" | "order" | "sectionId">;
type SpanSection = Pick<Section, "id" | "title">;

/**
 * Enforce the persisted Section invariant over active pages only:
 * every Section has at least one page and each Section's pages occupy one
 * contiguous span in the workflow's flat page order.
 */
export function assertValidSectionSpans(
  pages: SpanPage[],
  sections: SpanSection[],
  options: { emptyStatusCode?: 400 | 409 } = {},
): void {
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const pageCount = new Map(sections.map((section) => [section.id, 0]));
  const lastIndex = new Map<string, number>();
  if (new Set(pages.map((page) => page.order)).size !== pages.length) {
    throw new SectionLayoutError("Page order values must be unique");
  }
  const orderedPages = [...pages].sort((left, right) => left.order - right.order);

  for (const [index, page] of orderedPages.entries()) {
    if (page.sectionId === null) {
      continue;
    }

    const section = sectionById.get(page.sectionId);
    if (!section) {
      throw new SectionLayoutError(
        `Section ${page.sectionId} does not belong to this workflow`,
      );
    }

    const previousIndex = lastIndex.get(section.id);
    if (previousIndex !== undefined && index !== previousIndex + 1) {
      throw new SectionLayoutError(
        `Section "${section.title}" must contain a contiguous span of pages`,
      );
    }

    lastIndex.set(section.id, index);
    pageCount.set(section.id, (pageCount.get(section.id) ?? 0) + 1);
  }

  for (const section of sections) {
    if ((pageCount.get(section.id) ?? 0) === 0) {
      throw new SectionLayoutError(
        `Section "${section.title}" cannot be empty`,
        options.emptyStatusCode ?? 400,
      );
    }
  }
}
