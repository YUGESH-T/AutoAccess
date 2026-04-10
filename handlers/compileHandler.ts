import { APIError } from '../lib/errors.js';
import { ensureDocumentWrapper } from '../lib/latexUtils.js';

/**
 * Business logic for /api/compile.
 * Framework-agnostic: no HTTP req/res. Used by both:
 *   - api/compile.ts        (Vercel serverless)
 *   - server/geminiProxy.ts (Vite dev middleware)
 */

const TEXAPI_COMPILE = 'https://texapi.ovh/api/latex/compile';
const TEXAPI_FILES = 'https://texapi.ovh/api/latex/files';

export interface CompileInput {
  content: unknown;
}

export interface CompileOutput {
  success: boolean;
  pdfBase64?: string;
  log: string;
  errorType?: 'syntax' | 'service';
}

/** Validates input, compiles via Texapi, returns PDF as base64. Throws APIError on setup failure. */
export async function handleCompile(
  input: CompileInput,
  requestId: string,
): Promise<CompileOutput> {
  const { content } = input;

  if (!content || typeof content !== 'string') {
    throw new APIError('Missing content field.', 400);
  }

  const apiKey = process.env.TEXAPI_API_KEY;
  if (!apiKey) throw new APIError('TEXAPI_API_KEY not configured on server.', 500);

  const wrapped = ensureDocumentWrapper(content);
  console.log(`[compile:${requestId}] submitting ${wrapped.length} chars to texapi`);

  // Step 1: Compile
  const compileRes = await fetch(TEXAPI_COMPILE, {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: wrapped }),
  });

  if (!compileRes.ok) {
    const errText = await compileRes.text();
    return {
      success: false,
      errorType: 'service',
      log: `Texapi HTTP ${compileRes.status}: ${errText}`,
    };
  }

  const contentType = compileRes.headers.get('content-type') || '';

  // Texapi may return PDF directly on success
  if (contentType.includes('application/pdf')) {
    const pdfBase64 = Buffer.from(await compileRes.arrayBuffer()).toString('base64');
    console.log(`[compile:${requestId}] direct PDF response — success`);
    return { success: true, pdfBase64, log: 'Compilation successful.' };
  }

  // Two-step JSON flow
  const result = (await compileRes.json()) as {
    status: string;
    errors: string[];
    resultPath: string | null;
  };

  if (result.status !== 'success' || !result.resultPath) {
    return {
      success: false,
      errorType: 'syntax',
      log: result.errors?.join('\n') || 'Compilation failed — no error details returned.',
    };
  }

  // Step 2: Download PDF by key
  const fileKey = result.resultPath.split('/').pop();
  const pdfRes = await fetch(`${TEXAPI_FILES}/${fileKey}`, {
    method: 'GET',
    headers: { 'X-API-KEY': apiKey },
  });

  if (!pdfRes.ok) {
    return {
      success: false,
      errorType: 'service',
      log: `Failed to download PDF (HTTP ${pdfRes.status}).`,
    };
  }

  const pdfBase64 = Buffer.from(await pdfRes.arrayBuffer()).toString('base64');
  console.log(`[compile:${requestId}] two-step flow — success`);
  return { success: true, pdfBase64, log: 'Compilation successful.' };
}
