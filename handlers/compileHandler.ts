import {
  ConfigurationError,
  UpstreamServiceError,
  ValidationError,
} from '../lib/errors.js';
import {
  cleanLatex,
  ensureDocumentWrapper,
  fixLatex,
  validateLatexStructure,
} from '../lib/latexUtils.js';

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
  errorType?: 'syntax' | 'service' | 'validation';
}

/** Validates input, compiles via Texapi, returns PDF as base64. Throws APIError on setup failure. */
export async function handleCompile(
  input: CompileInput,
  requestId: string,
): Promise<CompileOutput> {
  const { content } = input;

  if (!content || typeof content !== 'string') {
    throw new ValidationError('Missing content field.', 'INVALID_LATEX_CONTENT');
  }

  const apiKey = process.env.TEXAPI_API_KEY;
  if (!apiKey) {
    throw new ConfigurationError('TEXAPI_API_KEY is not configured on the server.');
  }

  const normalized = cleanLatex(ensureDocumentWrapper(content));
  const initialValidation = validateLatexStructure(normalized);
  let preparedLatex = normalized;
  const repairNotes: string[] = [];

  if (!initialValidation.isValid) {
    const repaired = fixLatex(normalized);
    preparedLatex = repaired.fixedLatex;
    repairNotes.push(...repaired.fixes);

    const repairedValidation = validateLatexStructure(ensureDocumentWrapper(preparedLatex));
    if (!repairedValidation.isValid) {
      throw new ValidationError(
        `LaTeX structure is invalid and could not be repaired automatically: ${repairedValidation.errors.join(' ')}`,
        'INVALID_LATEX_STRUCTURE',
      );
    }
  }

  const wrapped = ensureDocumentWrapper(preparedLatex);
  console.log(`[compile:${requestId}] submitting ${wrapped.length} chars to texapi`);

  const compileRes = await fetch(TEXAPI_COMPILE, {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: wrapped }),
  });

  if (!compileRes.ok) {
    const errText = await compileRes.text();
    throw new UpstreamServiceError(`Texapi compile request failed (${compileRes.status}): ${errText}`);
  }

  const contentType = compileRes.headers.get('content-type') || '';

  if (contentType.includes('application/pdf')) {
    const pdfBase64 = Buffer.from(await compileRes.arrayBuffer()).toString('base64');
    console.log(`[compile:${requestId}] direct PDF response succeeded`);
    return {
      success: true,
      pdfBase64,
      log: buildCompileLog('Compilation successful.', repairNotes),
    };
  }

  const result = (await compileRes.json()) as {
    status: string;
    errors: string[];
    resultPath: string | null;
  };

  if (result.status !== 'success' || !result.resultPath) {
    return {
      success: false,
      errorType: 'syntax',
      log: buildCompileLog(
        result.errors?.join('\n') || 'Compilation failed with no error details returned.',
        repairNotes,
      ),
    };
  }

  const fileKey = result.resultPath.split('/').pop();
  const pdfRes = await fetch(`${TEXAPI_FILES}/${fileKey}`, {
    method: 'GET',
    headers: { 'X-API-KEY': apiKey },
  });

  if (!pdfRes.ok) {
    throw new UpstreamServiceError(`Failed to download compiled PDF (${pdfRes.status}).`);
  }

  const pdfBase64 = Buffer.from(await pdfRes.arrayBuffer()).toString('base64');
  console.log(`[compile:${requestId}] two-step flow succeeded`);
  return {
    success: true,
    pdfBase64,
    log: buildCompileLog('Compilation successful.', repairNotes),
  };
}

function buildCompileLog(message: string, repairNotes: string[]): string {
  if (repairNotes.length === 0) {
    return message;
  }

  return [
    'Automatic LaTeX fixes applied before compilation:',
    ...repairNotes.map((note) => `- ${note}`),
    '',
    message,
  ].join('\n');
}
