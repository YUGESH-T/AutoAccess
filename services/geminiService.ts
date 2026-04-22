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
    return (
      (!('provider' in value) || isProviderMeta((value as { provider?: unknown }).provider)) &&
      (!('timeline' in value) || isTimeline((value as { timeline?: unknown }).timeline))
    );
  }

  const fixes = (value as { fixes?: unknown }).fixes;
  return (
    Array.isArray(fixes) &&
    fixes.every((fix) => typeof fix === 'string') &&
    (!('provider' in value) || isProviderMeta((value as { provider?: unknown }).provider)) &&
    (!('timeline' in value) || isTimeline((value as { timeline?: unknown }).timeline))
  );
}

function isTimeline(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (step) =>
        !!step &&
        typeof step === 'object' &&
        typeof (step as { label?: unknown }).label === 'string' &&
        ((step as { status?: unknown }).status === 'done' ||
          (step as { status?: unknown }).status === 'active' ||
          (step as { status?: unknown }).status === 'pending') &&
        (!('meta' in (step as object)) || typeof (step as { meta?: unknown }).meta === 'string'),
    )
  );
}

function isProviderMeta(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const provider = value as {
    name?: unknown;
    model?: unknown;
    latencyMs?: unknown;
    fallbackUsed?: unknown;
    attemptedProviders?: unknown;
  };

  return (
    (provider.name === 'gemini' || provider.name === 'cohere' || provider.name === 'openrouter') &&
    typeof provider.model === 'string' &&
    typeof provider.latencyMs === 'number' &&
    typeof provider.fallbackUsed === 'boolean' &&
    Array.isArray(provider.attemptedProviders) &&
    provider.attemptedProviders.every(
      (name) => name === 'gemini' || name === 'cohere' || name === 'openrouter',
    )
  );
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
