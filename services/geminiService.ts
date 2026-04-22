import type { ContextFile, GeminiLatexResponse } from '../types';
import { getCacheKey, getCachedJson, setCache } from './generationCache';
import { fetchWithErrorHandling } from './apiClient';

function isGeminiLatexResponse(value: unknown): value is GeminiLatexResponse {
  if (!value || typeof value !== 'object' || !('latex' in value)) {
    return false;
  }

  if (typeof (value as { latex: unknown }).latex !== 'string') {
    return false;
  }

  if (!('fixes' in value)) {
    return true;
  }

  const fixes = (value as { fixes?: unknown }).fixes;
  return Array.isArray(fixes) && fixes.every((fix) => typeof fix === 'string');
}

/**
 * Calls the server-side /api/generate proxy.
 * The Gemini API key is never shipped to the browser.
 */
const generateLatex = async (
  question: string,
  contextFile?: ContextFile,
  removePlagiarism: boolean = false,
  signal?: AbortSignal,
  temperature: number = 0.5,
): Promise<GeminiLatexResponse> => {
  const cacheKey = getCacheKey(question, contextFile?.name, removePlagiarism, temperature);
  if (!contextFile) {
    const cached = getCachedJson(cacheKey, isGeminiLatexResponse);
    if (cached) {
      return cached;
    }
  }

  const data = await fetchWithErrorHandling<GeminiLatexResponse>('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, contextFile, removePlagiarism, temperature }),
    signal,
  });

  if (!contextFile) {
    setCache(cacheKey, JSON.stringify(data));
  }

  return data;
};

export const geminiService = {
  generateLatex,
};
