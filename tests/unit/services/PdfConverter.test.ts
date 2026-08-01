import fs from "fs/promises";
import os from "os";
import path from "path";

import mammoth from "mammoth";
import puppeteer, { type Browser } from "puppeteer";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { logger } from "../../../server/logger";
import {
  ApiStrategy,
  logPdfConverterSelection,
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

describe("PdfConverter.healthCheck", () => {
  it("reports the local strategy as reachable with no probe", async () => {
    stubFetch(async () => { throw new Error("should not be called"); });

    const health = await new PdfConverter(undefined).healthCheck();

    expect(health).toEqual({ strategy: "puppeteer", reachable: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("probes the API health endpoint without converting a document", async () => {
    const calls: string[] = [];
    stubFetch(async (url) => { calls.push(url); return new Response("ok", { status: 200 }); });

    const health = await new PdfConverter(API_URL).healthCheck();

    expect(health.strategy).toBe("gotenberg");
    expect(health.reachable).toBe(true);
    expect(health.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(calls).toEqual([`${API_URL}/health`]);
  });

  it("reports unreachable when the health endpoint fails", async () => {
    stubFetch(async () => new Response("nope", { status: 500 }));

    const health = await new PdfConverter(API_URL).healthCheck();

    expect(health.strategy).toBe("gotenberg");
    expect(health.reachable).toBe(false);
    expect(health.error).toMatch(/500/);
  });

  it("reports unreachable when the probe throws", async () => {
    stubFetch(async () => { throw new Error("ENOTFOUND gotenberg.test"); });

    const health = await new PdfConverter(API_URL).healthCheck();

    expect(health.reachable).toBe(false);
    expect(health.error).toMatch(/ENOTFOUND/);
  });
});

describe("logPdfConverterSelection", () => {
  /**
   * Both branches must log at `warn`, not `info`.
   *
   * This line is how an operator confirms which converter a deployed instance
   * picked. Deployments run with LOG_LEVEL=warn, so an info-level line is
   * filtered out and the boot log stays silent — which is exactly what happened
   * when this was first written, and exactly the blind spot it exists to close.
   */
  const originalUrl = process.env.PDF_CONVERTER_API_URL;

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.PDF_CONVERTER_API_URL;
    } else {
      process.env.PDF_CONVERTER_API_URL = originalUrl;
    }
  });

  it("announces the API converter at a level that survives LOG_LEVEL=warn", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    const info = vi.spyOn(logger, "info").mockImplementation(() => logger);
    process.env.PDF_CONVERTER_API_URL = API_URL;

    logPdfConverterSelection();

    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: "gotenberg", fallback: "puppeteer" }),
      expect.stringContaining("high-fidelity")
    );
  });

  it("warns loudly when no converter is configured", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    delete process.env.PDF_CONVERTER_API_URL;

    logPdfConverterSelection();

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: "puppeteer" }),
      expect.stringContaining("PDF_CONVERTER_API_URL")
    );
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

/**
 * DOCP-001: neither Puppeteer page operation used to carry a timeout, so a
 * template with a remote image/font (setContent) or a rendering hang (pdf)
 * held the request open indefinitely. These drive `convert()` for real
 * against a mocked Puppeteer page — no Chromium launched — to pin the
 * timeout option and the close-on-timeout cleanup in place.
 */
describe("PuppeteerStrategy page timeouts", () => {
  interface FakePage {
    setContent: MockInstance<(html: string, options?: { timeout?: number }) => Promise<unknown>>;
    pdf: MockInstance<(options?: { timeout?: number }) => Promise<unknown>>;
    close: MockInstance<() => Promise<void>>;
  }

  function fakePage(behaviour: "succeed" | "timeout"): FakePage {
    const setContent = vi.fn(async () => {
      if (behaviour === "timeout") {
        throw new Error("Navigation timeout of 10000 ms exceeded");
      }
    });
    const pdf = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    return { setContent, pdf, close };
  }

  function stubBrowserWithPage(page: ReturnType<typeof fakePage>): void {
    const browser = {
      connected: true,
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(puppeteer, "launch").mockResolvedValue(browser as unknown as Browser);
  }

  beforeEach(() => {
    vi.spyOn(mammoth, "convertToHtml").mockResolvedValue({ value: "<p>hi</p>", messages: [] });
  });

  afterEach(async () => {
    // The shared browser is a static singleton — drop it so each test gets
    // its own `puppeteer.launch` stub instead of reusing the last one.
    await PuppeteerStrategy.closeBrowser();
  });

  it("passes the same named timeout constant to setContent and pdf", async () => {
    const page = fakePage("succeed");
    stubBrowserWithPage(page);

    await new PuppeteerStrategy().convert({ docxPath, outputPath });

    expect(page.setContent).toHaveBeenCalledOnce();
    expect(page.pdf).toHaveBeenCalledOnce();

    const setContentTimeout = page.setContent.mock.calls[0]?.[1]?.timeout;
    const pdfTimeout = page.pdf.mock.calls[0]?.[0]?.timeout;
    expect(typeof setContentTimeout).toBe("number");
    expect(setContentTimeout).toBe(pdfTimeout);
  });

  it("closes the page and surfaces a normal conversion error when setContent times out, instead of hanging", async () => {
    const page = fakePage("timeout");
    stubBrowserWithPage(page);

    await expect(new PuppeteerStrategy().convert({ docxPath, outputPath }))
      .rejects.toThrow(/PDF conversion failed/);

    expect(page.close).toHaveBeenCalledOnce();
    expect(page.pdf).not.toHaveBeenCalled();
  });
});
