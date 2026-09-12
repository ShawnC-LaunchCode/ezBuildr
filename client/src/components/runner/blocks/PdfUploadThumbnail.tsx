import { Document, Page } from 'react-pdf';

import '@/lib/pdfWorker';

interface PdfUploadThumbnailProps {
  filename: string;
  onError: () => void;
  onLoad: () => void;
  source: string | globalThis.File;
}

export default function PdfUploadThumbnail({
  filename,
  onError,
  onLoad,
  source,
}: PdfUploadThumbnailProps) {
  return (
    <Document
      file={source}
      className="h-full w-full"
      loading={null}
      error={null}
      noData={null}
      onLoadError={onError}
      onSourceError={onError}
      onPassword={onError}
      aria-label={`PDF document for ${filename}`}
    >
      <Page
        pageNumber={1}
        width={384}
        className="flex h-full w-full items-center justify-center [&_.react-pdf__Page__canvas]:!h-auto [&_.react-pdf__Page__canvas]:!max-h-full [&_.react-pdf__Page__canvas]:!max-w-full [&_.react-pdf__Page__canvas]:!w-auto"
        loading={null}
        error={null}
        noData={null}
        renderTextLayer={false}
        renderAnnotationLayer={false}
        onLoadError={onError}
        onRenderError={onError}
        onRenderSuccess={onLoad}
      />
    </Document>
  );
}
