import fs from "fs/promises";
import os from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import {
  ApiStrategy,
  PdfConverter,
  PuppeteerStrategy,
} from "../../../server/services/document/PdfConverter";

/**
 * Conversion-strategy selection, fallback reporting, and health probing.
 *
 * Background: `ApiStrategy.convert` used to be a stub that always threw, while
 * production had `PDF_CONVERTER_API_URL` set. Every conversion therefore fell
 * through to the low-fidelity Mammoth->Puppeteer path, the database recorded a
 * hardcoded 'puppeteer' either way, and nothing anywhere said so. These tests
 * pin down the three properties that make that state impossible to repeat:
 * the API is really called, the fallback is reported, and health is observable.
 *
 * Puppeteer is stubbed throughout — no Chromium is launched.
 */

const API_URL = "http://gotenberg.test:3000";

let tmpDir: string;
let docxPath: string;
let outputPath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pdfconv-"));
  docxPath = path.join(tmpDir, "source.docx");
  outputPath = path.join(tmpDir, "out.pdf");
  await fs.writeFile(docxPath, "fake docx bytes");
  vi.restoreAllMocks();
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** Stub Puppeteer so the fallback is observable without launching a browser. */
function stubPuppeteer(
  behaviour: "succeed" | "fail" = "succeed"
): MockInstance<PuppeteerStrategy["convert"]> {
  return vi.spyOn(PuppeteerStrategy.prototype, "convert").mockImplementation(async ({ outputPath: out }) => {
    if (behaviour === "fail") { throw new Error("chromium unavailable"); }
    await fs.writeFile(out, "puppeteer pdf");
  });
}

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>): void {
  vi.stubGlobal("fetch", vi.fn(impl as unknown as typeof fetch));
}

function pdfResponse(body = "%PDF-1.7 fake"): Response {
  return new Response(Buffer.from(body), { status: 200 });
}

describe("PdfConverter strategy selection", () => {
  it("uses only Puppeteer when no API url is configured", async () => {
    const puppeteer = stubPuppeteer();
    const converter = new PdfConverter(undefined);

    expect(converter.primaryStrategy).toBe("puppeteer");

    const outcome = await converter.convert({ docxPath, outputPath });

    expect(outcome).toEqual({ strategy: "puppeteer", fellBack: false });
    expect(puppeteer).toHaveBeenCalledOnce();
  });

  it("uses the API strategy when an API url is configured", async () => {
    const puppeteer = stubPuppeteer();
    stubFetch(async () => pdfResponse());

    const converter = new PdfConverter(API_URL);
    expect(converter.primaryStrategy).toBe("gotenberg");

    const outcome = await converter.convert({ docxPath, outputPath });

    expect(outcome).toEqual({ strategy: "gotenberg", fellBack: false });
    expect(puppeteer).not.toHaveBeenCalled();
    await expect(fs.readFile(outputPath, "utf8")).resolves.toContain("%PDF");
  });

  it("posts to Gotenberg's LibreOffice route and keeps the .docx filename", async () => {
    // Gotenberg selects its converter from the uploaded part's extension, so a
    // lost .docx suffix silently breaks conversion.
    stubPuppeteer();
    let calledUrl = "";
    let sentFilename: string | undefined;
    stubFetch(async (url, init) => {
      calledUrl = url;
      const body = init?.body as FormData;
      const file = body.get("files");
      sentFilename = file instanceof File ? file.name : undefined;
      return pdfResponse();
    });

    await new PdfConverter(API_URL).convert({ docxPath, outputPath });

    expect(calledUrl).toBe(`${API_URL}/forms/libreoffice/convert`);
    expect(sentFilename).toBe("source.docx");
  });

  it("does not double a slash when the API url has a trailing one", async () => {
    stubPuppeteer();
    let calledUrl = "";
    stubFetch(async (url) => { calledUrl = url; return pdfResponse(); });

    await new PdfConverter(`${API_URL}/`).convert({ docxPath, outputPath });

    expect(calledUrl).toBe(`${API_URL}/forms/libreoffice/convert`);
  });
});

describe("PdfConverter fallback reporting", () => {
  it("falls back to Puppeteer and reports it when the API errors", async () => {
    const puppeteer = stubPuppeteer();
    stubFetch(async () => new Response("boom", { status: 503 }));

    const outcome = await new PdfConverter(API_URL).convert({ docxPath, outputPath });

    expect(outcome).toEqual({ strategy: "puppeteer", fellBack: true });
    expect(puppeteer).toHaveBeenCalledOnce();
    await expect(fs.readFile(outputPath, "utf8")).resolves.toBe("puppeteer pdf");
  });

  it("falls back when the API is unreachable", async () => {
    const puppeteer = stubPuppeteer();
    stubFetch(async () => { throw new Error("ECONNREFUSED"); });

    const outcome = await new PdfConverter(API_URL).convert({ docxPath, outputPath });

    expect(outcome).toEqual({ strategy: "puppeteer", fellBack: true });
    expect(puppeteer).toHaveBeenCalledOnce();
  });

  it("treats an empty response body as a failure rather than writing a 0-byte PDF", async () => {
    const puppeteer = stubPuppeteer();
    stubFetch(async () => new Response(Buffer.alloc(0), { status: 200 }));

    const outcome = await new PdfConverter(API_URL).convert({ docxPath, outputPath });

    expect(outcome).toEqual({ strategy: "puppeteer", fellBack: true });
    expect(puppeteer).toHaveBeenCalledOnce();
  });

  it("propagates the error when there is no fallback available", async () => {
    stubPuppeteer("fail");

    await expect(new PdfConverter(undefined).convert({ docxPath, outputPath }))
      .rejects.toThrow(/chromium unavailable|PDF conversion failed/i);
  });

  it("propagates the fallback's error when both strategies fail", async () => {
    stubPuppeteer("fail");
    stubFetch(async () => { throw new Error("ECONNREFUSED"); });

    await expect(new PdfConverter(API_URL).convert({ docxPath, outputPath }))
      .rejects.toThrow(/chromium unavailable|PDF conversion failed/i);
  });

  it("sends an abort signal so a hung converter cannot block forever", async () => {
    stubPuppeteer();
    let receivedSignal: AbortSignal | undefined;
    stubFetch(async (_url, init) => {
      receivedSignal = init?.signal ?? undefined;
      return pdfResponse();
    });

    await new PdfConverter(API_URL).convert({ docxPath, outputPath });

    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });
});

describe("ApiStrategy", () => {
  it("is named for the converter it uses, so records are meaningful", () => {
    expect(new ApiStrategy(API_URL).name).toBe("gotenberg");
    expect(new PuppeteerStrategy().name).toBe("puppeteer");
  });

  it("includes the upstream status and body in its error", async () => {
    stubFetch(async () => new Response("libreoffice exploded", { status: 500 }));

    await expect(new ApiStrategy(API_URL).convert({ docxPath, outputPath }))
      .rejects.toThrow(/Gotenberg returned 500: libreoffice exploded/);
  });
});
