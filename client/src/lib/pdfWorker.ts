import { pdfjs } from 'react-pdf';

// Keep every react-pdf surface on the same local worker. A CDN worker would
// violate the app's CSP and configuring this beside each viewer can drift.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
