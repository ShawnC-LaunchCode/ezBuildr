import { ConcurrencyLimiter } from '../utils/concurrency';

// Max concurrent document global processes (scan, convert, etc.)
// Default 2 to keep CPU usage low on small instances (Railway)
export const MAX_CONCURRENT_DOCS = parseInt(process.env.MAX_CONCURRENT_DOC_PROCESSES ?? '2');

// The gate's illustrative 5s budget is too tight for a 10 MB DOCX on a small
// Railway instance; 30s still bounds resource use while allowing normal uploads.
export const DOCUMENT_PROCESSING_TIMEOUT_MS = parseInt(
  process.env.DOCUMENT_PROCESSING_TIMEOUT_MS ?? '30000'
);

export const documentProcessingLimiter = new ConcurrencyLimiter(MAX_CONCURRENT_DOCS);
