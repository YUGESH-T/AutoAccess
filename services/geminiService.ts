import type { ContextFile } from "../types";

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
): Promise<string> => {
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
      body: JSON.stringify({ question, contextFile, removePlagiarism }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(errorBody || `Server error (HTTP ${response.status})`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
};

export const geminiService = {
  generateLatex,
};
