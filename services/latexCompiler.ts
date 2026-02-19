export interface CompilationResult {
  success: boolean;
  pdfBlob?: Blob;
  log: string;
  errorType?: 'syntax' | 'service' | 'network';
}

/**
 * Compiles LaTeX to PDF via the server-side proxy (/api/compile).
 * The proxy handles the Texapi API key and two-step compile+download flow.
 * Works identically in local dev (Vite plugin) and production (Vercel serverless).
 */
export async function compileToPdf(latexCode: string): Promise<CompilationResult> {
  try {
    const response = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: latexCode }),
    });

    const data = await response.json();

    if (data.success && data.pdfBase64) {
      const binaryString = atob(data.pdfBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const pdfBlob = new Blob([bytes], { type: 'application/pdf' });
      return {
        success: true,
        pdfBlob,
        log: data.log || 'Compilation successful.',
      };
    }

    return {
      success: false,
      log: data.log || data.error || `Compilation failed (HTTP ${response.status}).`,
      errorType: data.errorType || (response.status >= 500 ? 'service' : 'syntax'),
    };
  } catch (err: any) {
    return {
      success: false,
      log: err.message || 'Network error — could not reach compilation server.',
      errorType: 'network',
    };
  }
}
