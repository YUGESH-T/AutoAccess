const LATEX_COMPILE_ENDPOINT = 'https://latexonline.cc/compile';

export interface CompilationResult {
  success: boolean;
  pdfBlob?: Blob;
  log: string;
}

/**
 * Wraps bare LaTeX snippets in a minimal document structure.
 * If the code already contains \documentclass, it is returned as-is.
 */
function ensureDocumentWrapper(code: string): string {
  if (/\\documentclass/i.test(code)) return code;
  return [
    '\\documentclass{article}',
    '\\usepackage{amsmath,amssymb,graphicx,geometry}',
    '\\geometry{a4paper,margin=1in}',
    '\\begin{document}',
    code,
    '\\end{document}',
  ].join('\n');
}

export async function compileToPdf(latexCode: string): Promise<CompilationResult> {
  try {
    const wrappedCode = ensureDocumentWrapper(latexCode);

    const body = new URLSearchParams({
      text: wrappedCode,
      command: 'pdflatex',
      force: 'true',
    });

    const response = await fetch(LATEX_COMPILE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/pdf',
      },
      body,
    });

    if (response.ok) {
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('application/pdf')) {
        const pdfBlob = await response.blob();
        return {
          success: true,
          pdfBlob,
          log: 'Compilation successful.',
        };
      }
      // Server returned 2xx but not PDF — likely an error page
      const errorText = await response.text();
      return {
        success: false,
        log: errorText || 'Server returned unexpected content type.',
      };
    }

    // HTTP 4xx/5xx — response body contains compilation error log
    const errorLog = await response.text();
    return {
      success: false,
      log: errorLog || `Compilation failed (HTTP ${response.status}).`,
    };
  } catch (err: any) {
    return {
      success: false,
      log: err.message || 'Network error — could not reach compilation server.',
    };
  }
}
