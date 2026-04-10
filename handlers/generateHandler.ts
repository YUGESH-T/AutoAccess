import { APIError } from '../lib/errors.js';
import { callGemini } from '../lib/geminiClient.js';
import { PROMPT_VERSION } from '../lib/promptVersion.js';
import { cleanLatex } from '../lib/latexUtils.js';

/**
 * Business logic for /api/generate.
 * Framework-agnostic: no HTTP req/res. Used by both:
 *   - api/generate.ts       (Vercel serverless)
 *   - server/geminiProxy.ts (Vite dev middleware)
 */

const ALLOWED_MIMES = ['application/pdf', 'text/plain'];
const MAX_BASE64_LEN = 3 * 1024 * 1024 * 1.37; // ~4.1 MB base64 ≈ 3 MB raw

export interface GenerateInput {
  question: unknown;
  contextFile?: { name: string; mimeType: string; base64: string } | null;
  removePlagiarism?: unknown;
  temperature?: unknown;
}

export interface GenerateOutput {
  latex_code: string;
  _promptVersion: string;
}

/**
 * Strictly parses and validates the Gemini JSON response.
 * Handles cases where the model might wrap JSON in markdown fences.
 */
function safeParse(json: string): GenerateOutput {
  const cleaned = json
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new APIError('Malformed JSON from AI model. Please try again.', 502);
  }

  // Handle both latex_code (standard) and latex (AI variant)
  const code = parsed.latex_code || parsed.latex;

  if (!code || typeof code !== 'string') {
    throw new APIError('AI response missing valid LaTeX field.', 502);
  }

  return {
    latex_code: code,
    _promptVersion: PROMPT_VERSION,
  };
}

/** Validates input, calls Gemini, returns structured output. Throws APIError on any failure. */
export async function handleGenerate(
  input: GenerateInput,
  requestId: string,
): Promise<GenerateOutput> {
  const { question, contextFile, removePlagiarism, temperature } = input;

  // Input validation
  if (!question || typeof question !== 'string' || question.trim().length < 3) {
    throw new APIError('Missing or invalid question — must be a non-empty string.', 400);
  }

  if (contextFile?.mimeType && !ALLOWED_MIMES.includes(contextFile.mimeType)) {
    throw new APIError(
      `Unsupported file type: ${contextFile.mimeType}. Only PDF and TXT are allowed.`,
      400,
    );
  }

  if (contextFile?.base64 && contextFile.base64.length > MAX_BASE64_LEN) {
    throw new APIError('Uploaded file exceeds 3 MB limit.', 413);
  }

  const temp =
    typeof temperature === 'number' && temperature >= 0 && temperature <= 2 ? temperature : 0.5;
  const removeFlag = typeof removePlagiarism === 'boolean' ? removePlagiarism : !!removePlagiarism;

  // Call Gemini with internal escalation layer
  const rawResponse = await callGemini(
    {
      question,
      contextFile: contextFile ?? null,
      removePlagiarism: removeFlag,
      temperature: temp,
    },
    requestId,
  );

  // Parse, validate, and clean
  const validated = safeParse(rawResponse);
  
  return {
    ...validated,
    latex_code: cleanLatex(validated.latex_code),
  };
}
