import type { ContextFile } from "../types";
import { getCacheKey, getCached, setCache } from "./generationCache";

const API_TIMEOUT_MS = 120_000; // 2 minute timeout

/**
 * Calls the server-side /api/generate proxy.
 * The Gemini API key is NEVER shipped to the browser.
 */
const generateLatex = async (
  question: string,
  contextFile?: ContextFile,
  removePlagiarism: boolean = false,
  signal?: AbortSignal,
  temperature: number = 0.5,
): Promise<string> => {
  // Check cache first (skip if context file is attached — too large to hash)
  const cacheKey = getCacheKey(question, contextFile?.name, removePlagiarism, temperature);
  if (!contextFile) {
    const cached = getCached(cacheKey);
    if (cached) return cached;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  // If the caller provides a signal, mirror its abort
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, contextFile, removePlagiarism, temperature }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(errorBody || `Server error (HTTP ${response.status})`);
    }

    const text = await response.text();

    // Cache successful responses (skip if context file)
    if (!contextFile) {
      setCache(cacheKey, text);
    }

    return text;
  } finally {
    clearTimeout(timeout);
  }
};

export const geminiService = {
  generateLatex,
};
