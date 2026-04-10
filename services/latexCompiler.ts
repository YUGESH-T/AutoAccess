export interface CompilationResult {
  success: boolean;
  pdfBlob?: Blob;
  log: string;
  errorType?: 'syntax' | 'service' | 'network' | 'validation';
}

/**
 * Compiles LaTeX to PDF via the server-side proxy (/api/compile).
 */
export async function compileToPdf(latexCode: string): Promise<CompilationResult> {
  try {
    const API_TIMEOUT_MS = 55_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    const response = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: latexCode }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    console.log("COMPILE RESPONSE:", data);

    if (!data || data.success !== true) {
      console.error("Compile failed:", data);
      return {
        success: false,
        log: data?.error || data?.log || `Compilation failed (HTTP ${response.status}).`,
        errorType: data?.errorType || (response.status >= 500 ? 'service' : 'syntax'),
      };
    }

    const base64 = data.pdfBase64;
    if (!base64) {
      throw new Error("Missing PDF data");
    }

    // ✅ STEP 1: CLEAN BASE64 (VERY IMPORTANT)
    const cleanBase64 = base64
      .replace(/^data:application\/pdf;base64,/, '') // remove prefix
      .replace(/\s/g, '')                            // remove spaces/newlines
      .replace(/[^A-Za-z0-9+/=]/g, '');              // remove invalid chars

    console.log("CHECK:", cleanBase64.slice(0, 10));

    // Must start with JVBER
    if (!cleanBase64.startsWith("JVBER")) {
      throw new Error("Invalid PDF base64 format detected.");
    }

    // ✅ STEP 2: DECODE PROPERLY
    const byteChars = atob(cleanBase64);
    const byteNumbers = new Uint8Array(byteChars.length);

    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }

    // ✅ STEP 3: CREATE BLOB
    const pdfBlob = new Blob([byteNumbers], { type: 'application/pdf' });

    console.log("BLOB:", pdfBlob.type, pdfBlob.size);

    if (pdfBlob.size < 1000) {
      throw new Error("Corrupted PDF data received (too small).");
    }

    return {
      success: true,
      pdfBlob,
      log: data.log || 'Compilation successful.',
    };

  } catch (err: unknown) {
    return {
      success: false,
      log: err instanceof Error ? err.message : 'Network error — could not reach compilation server.',
      errorType: 'network',
    };
  }
}

