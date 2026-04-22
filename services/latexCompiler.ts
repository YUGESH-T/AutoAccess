import { ApiClientError, fetchWithErrorHandling } from './apiClient';
import type { Diagnostic } from '../lib/latexDiagnostics';

export interface CompilationResult {
  success: boolean;
  pdfBlob?: Blob;
  log: string;
  errorType?: 'syntax' | 'service' | 'network' | 'validation';
  fixes: string[];
  diagnostics: Diagnostic[];
}

interface CompileSuccessPayload {
  success: boolean;
  pdfBase64?: string;
  log: string;
  errorType?: 'syntax' | 'service' | 'validation';
  fixes: string[];
  diagnostics: Diagnostic[];
}

/**
 * Compiles LaTeX to PDF via the server-side proxy (/api/compile).
 */
export async function compileToPdf(latexCode: string): Promise<CompilationResult> {
  try {
    const data = await fetchWithErrorHandling<CompileSuccessPayload>('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: latexCode }),
    });

    if (!data || data.success !== true) {
      return {
        success: false,
        log: data?.log || 'Compilation failed.',
        errorType: data?.errorType || 'syntax',
        fixes: data?.fixes || [],
        diagnostics: data?.diagnostics || [],
      };
    }

    const base64 = data.pdfBase64;
    if (!base64) {
      throw new Error('Missing PDF data');
    }

    const cleanBase64 = base64
      .replace(/^data:application\/pdf;base64,/, '')
      .replace(/\s/g, '')
      .replace(/[^A-Za-z0-9+/=]/g, '');

    if (!cleanBase64.startsWith('JVBER')) {
      throw new Error('Invalid PDF data received from the compilation service.');
    }

    const byteChars = atob(cleanBase64);
    const byteNumbers = new Uint8Array(byteChars.length);

    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }

    const pdfBlob = new Blob([byteNumbers], { type: 'application/pdf' });

    if (pdfBlob.size < 1000) {
      throw new Error('Corrupted PDF data received.');
    }

    return {
      success: true,
      pdfBlob,
      log: data.log || 'Compilation successful.',
      fixes: data.fixes || [],
      diagnostics: data.diagnostics || [],
    };
  } catch (err: unknown) {
    if (err instanceof ApiClientError) {
      return {
        success: false,
        log: err.message,
        errorType: mapCompileErrorType(err),
        fixes: [],
        diagnostics: [],
      };
    }

    return {
      success: false,
      log: err instanceof Error ? err.message : 'Network error. Could not reach the compilation server.',
      errorType: 'network',
      fixes: [],
      diagnostics: [],
    };
  }
}

function mapCompileErrorType(error: ApiClientError): CompilationResult['errorType'] {
  if (
    error.status === 400 ||
    error.code === 'INVALID_LATEX_STRUCTURE' ||
    error.code === 'INVALID_LATEX_CONTENT'
  ) {
    return 'validation';
  }

  if (error.status === 502 || error.status === 503) {
    return 'service';
  }

  return 'network';
}
