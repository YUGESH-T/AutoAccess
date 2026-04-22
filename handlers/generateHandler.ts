import {
  AIContractError,
  PayloadTooLargeError,
  ValidationError,
} from '../lib/errors.js';
import { callGemini } from '../lib/geminiClient.js';
import { PROMPT_VERSION } from '../lib/promptVersion.js';
import {
  cleanLatex,
  fixLatex,
  validateLatexStructure,
} from '../lib/latexUtils.js';
import { MAX_FILE_SIZE_BASE64_LENGTH, MAX_FILE_SIZE_BYTES } from '../lib/constants.js';

/**
 * Business logic for /api/generate.
 * Framework-agnostic: no HTTP req/res. Used by both:
 *   - api/generate.ts       (Vercel serverless)
 *   - server/geminiProxy.ts (Vite dev middleware)
 */

const ALLOWED_MIMES = ['application/pdf', 'text/plain'];

export interface GenerateInput {
  question: unknown;
  contextFile?: { name: string; mimeType: string; base64: string } | null;
  removePlagiarism?: unknown;
  temperature?: unknown;
}

export interface GenerateOutput {
  latex: string;
  _promptVersion: string;
  fixes: string[];
}

/**
 * Strictly parses and validates the Gemini JSON response.
 * Handles cases where the model might wrap JSON in markdown fences.
 */
function safeParse(json: string): GenerateOutput {
  const cleaned = json.replace(/```json/g, '').replace(/```/g, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new AIContractError('AI response was not valid JSON.');
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('latex' in parsed) ||
    typeof (parsed as { latex: unknown }).latex !== 'string'
  ) {
    throw new AIContractError('AI response did not match the expected schema.');
  }

  return {
    latex: (parsed as { latex: string }).latex,
    _promptVersion: PROMPT_VERSION,
    fixes: [],
  };
}

/** Validates input, calls Gemini, returns structured output. Throws APIError on any failure. */
export async function handleGenerate(
  input: GenerateInput,
  requestId: string,
): Promise<GenerateOutput> {
  const { question, contextFile, removePlagiarism, temperature } = input;

  if (!question || typeof question !== 'string' || question.trim().length < 3) {
    throw new ValidationError(
      'Question must be a non-empty string with at least 3 characters.',
      'INVALID_QUESTION',
    );
  }

  if (contextFile) {
    if (typeof contextFile.name !== 'string' || typeof contextFile.mimeType !== 'string' || typeof contextFile.base64 !== 'string') {
      throw new ValidationError('Uploaded file payload is malformed.', 'INVALID_CONTEXT_FILE');
    }

    if (!ALLOWED_MIMES.includes(contextFile.mimeType)) {
      throw new ValidationError(
        `Unsupported file type: ${contextFile.mimeType}. Only PDF and TXT files are allowed.`,
        'INVALID_FILE_TYPE',
      );
    }

    if (contextFile.base64.length > MAX_FILE_SIZE_BASE64_LENGTH) {
      throw new PayloadTooLargeError(
        `Uploaded file exceeds the ${Math.floor(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB limit.`,
        'FILE_TOO_LARGE',
      );
    }
  }

  const temp =
    typeof temperature === 'number' && temperature >= 0 && temperature <= 2 ? temperature : 0.5;
  const removeFlag = typeof removePlagiarism === 'boolean' ? removePlagiarism : !!removePlagiarism;

  const rawResponse = await callGemini(
    {
      question,
      contextFile: contextFile ?? null,
      removePlagiarism: removeFlag,
      temperature: temp,
    },
    requestId,
  );

  const validated = safeParse(rawResponse);
  const cleanedLatex = cleanLatex(validated.latex);
  const initialValidation = validateLatexStructure(cleanedLatex);

  let finalLatex = cleanedLatex;
  let fixes: string[] = [];

  if (!initialValidation.isValid) {
    const repairResult = fixLatex(cleanedLatex);
    fixes = repairResult.fixes;

    if (fixes.length > 0) {
      console.warn(
        `[generate:${requestId}] applied latex fixes: ${fixes.join(' | ')}`,
      );
    }

    finalLatex = repairResult.fixedLatex;

    const repairedValidation = validateLatexStructure(finalLatex);
    if (!repairedValidation.isValid) {
      throw new AIContractError(
        `AI generated invalid LaTeX structure after auto-repair: ${repairedValidation.errors.join(' ')}`,
      );
    }
  }

  return {
    ...validated,
    latex: finalLatex,
    fixes,
  };
}
