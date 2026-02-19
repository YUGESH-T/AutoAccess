/**
 * Type declarations for global CDN libraries used at runtime.
 * Keeps TypeScript happy without pulling in full @types packages.
 */

/* ── MathJax (v3 — tex-svg) ── */
export interface MathJaxInstance {
  typesetPromise?: (elements?: HTMLElement[]) => Promise<void>;
  Hub?: {
    Queue: (args: unknown[]) => void;
  };
}

/* ── pdf.js (3.x) ── */
export interface PdfJsPage {
  getViewport(params: { scale: number }): { width: number; height: number };
  render(params: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): { promise: Promise<void> };
}

export interface PdfJsDocument {
  numPages: number;
  getPage(num: number): Promise<PdfJsPage>;
}

export interface PdfJsLib {
  getDocument(params: { data: ArrayBuffer }): { promise: Promise<PdfJsDocument> };
}

/* ── JSZip ── */
export interface JSZipInstance {
  file(name: string, data: string | Blob): void;
  generateAsync(options: { type: string }): Promise<Blob>;
}

export interface JSZipConstructor {
  new (): JSZipInstance;
}

/* ── Augment Window ── */
declare global {
  interface Window {
    MathJax?: MathJaxInstance;
    pdfjsLib?: PdfJsLib;
  }
  // eslint-disable-next-line no-var
  var JSZip: JSZipConstructor;
}
