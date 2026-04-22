import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generateContentMock = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: generateContentMock,
    },
  })),
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
  },
}));

import { callGemini, resetAIProviderHealthForTest } from '../lib/geminiClient';

describe('callGemini provider fallback', () => {
  const originalFetch = global.fetch;
  const originalEnv = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    COHERE_API_KEY: process.env.COHERE_API_KEY,
    COHERE_MODEL: process.env.COHERE_MODEL,
    COHERE_TIMEOUT_MS: process.env.COHERE_TIMEOUT_MS,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_TIMEOUT_MS: process.env.OPENROUTER_TIMEOUT_MS,
    GEMINI_TIMEOUT_MS: process.env.GEMINI_TIMEOUT_MS,
    AI_PROVIDER_ORDER: process.env.AI_PROVIDER_ORDER,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetAIProviderHealthForTest();
    process.env.GEMINI_API_KEY = 'gemini-key';
    delete process.env.COHERE_MODEL;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.COHERE_TIMEOUT_MS;
    delete process.env.OPENROUTER_TIMEOUT_MS;
    delete process.env.GEMINI_TIMEOUT_MS;
    delete process.env.AI_PROVIDER_ORDER;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalEnv.GEMINI_API_KEY;
    process.env.COHERE_API_KEY = originalEnv.COHERE_API_KEY;
    process.env.COHERE_MODEL = originalEnv.COHERE_MODEL;
    process.env.COHERE_TIMEOUT_MS = originalEnv.COHERE_TIMEOUT_MS;
    process.env.OPENROUTER_API_KEY = originalEnv.OPENROUTER_API_KEY;
    process.env.OPENROUTER_MODEL = originalEnv.OPENROUTER_MODEL;
    process.env.OPENROUTER_TIMEOUT_MS = originalEnv.OPENROUTER_TIMEOUT_MS;
    process.env.GEMINI_TIMEOUT_MS = originalEnv.GEMINI_TIMEOUT_MS;
    process.env.AI_PROVIDER_ORDER = originalEnv.AI_PROVIDER_ORDER;
  });

  it('falls back to Cohere when Gemini returns malformed structured output', async () => {
    process.env.COHERE_API_KEY = 'cohere-key';
    delete process.env.OPENROUTER_API_KEY;

    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({ note: 'missing latex key' }),
    });

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          message: {
            content: [
              {
                text: JSON.stringify({
                  latex:
                    '\\documentclass{article}\n\\begin{document}\nFallback content from Cohere with a complete LaTeX document body.\n\nThis section explains the assignment answer in a longer form so the response is clearly not truncated.\n\nAdditional detail is included here to simulate a realistic provider fallback payload with enough body text for the structural quality gate.\n\\end{document}',
                }),
              },
            ],
          },
        }),
    }) as typeof fetch;

    const result = await callGemini(
      {
        question: 'Explain photosynthesis',
        removePlagiarism: false,
        temperature: 0.5,
      },
      'fallback-1',
    );

    expect(JSON.parse(result.text)).toEqual({
      latex:
        '\\documentclass{article}\n\\begin{document}\nFallback content from Cohere with a complete LaTeX document body.\n\nThis section explains the assignment answer in a longer form so the response is clearly not truncated.\n\nAdditional detail is included here to simulate a realistic provider fallback payload with enough body text for the structural quality gate.\n\\end{document}',
    });
    expect(result.provider.name).toBe('cohere');
    expect(result.provider.fallbackUsed).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.cohere.ai/v2/chat',
      expect.any(Object),
    );
  });

  it('falls back to OpenRouter when Gemini fails and Cohere is unavailable', async () => {
    delete process.env.COHERE_API_KEY;
    process.env.OPENROUTER_API_KEY = 'openrouter-key';

    generateContentMock.mockRejectedValue(new Error('503 overloaded'));

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  latex:
                    '\\documentclass{article}\n\\begin{document}\nRecovered from OpenRouter fallback output with a complete LaTeX document body that is long enough to pass the structural quality gate.\n\nThis paragraph gives the fallback provider enough content to avoid looking truncated.\n\nA second paragraph reinforces that the response is complete, well formed, and appropriate for the fallback acceptance check.\n\\end{document}',
                }),
              },
            },
          ],
        }),
    }) as typeof fetch;

    const result = await callGemini(
      {
        question: 'Explain Newton laws',
        removePlagiarism: false,
        temperature: 0.4,
      },
      'fallback-2',
    );

    expect(JSON.parse(result.text)).toEqual({
      latex:
        '\\documentclass{article}\n\\begin{document}\nRecovered from OpenRouter fallback output with a complete LaTeX document body that is long enough to pass the structural quality gate.\n\nThis paragraph gives the fallback provider enough content to avoid looking truncated.\n\nA second paragraph reinforces that the response is complete, well formed, and appropriate for the fallback acceptance check.\n\\end{document}',
    });
    expect(result.provider.name).toBe('openrouter');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.any(Object),
    );
  });

  it('uses the configured provider order for backups', async () => {
    process.env.COHERE_API_KEY = 'cohere-key';
    process.env.OPENROUTER_API_KEY = 'openrouter-key';
    process.env.AI_PROVIDER_ORDER = 'gemini,openrouter,cohere';

    generateContentMock.mockRejectedValue(new Error('503 overloaded'));

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  latex:
                    '\\documentclass{article}\n\\begin{document}\nOpenRouter should be tried before Cohere when configured first in the provider order.\n\nThis payload is long enough to be accepted by the structured-output quality gate.\n\nA second paragraph makes the fallback output clearly complete so the chain stops before Cohere is attempted.\n\\end{document}',
                }),
              },
            },
          ],
        }),
    }) as typeof fetch;

    const result = await callGemini(
      {
        question: 'Explain thermodynamics',
        removePlagiarism: false,
        temperature: 0.5,
      },
      'fallback-3',
    );

    expect(JSON.parse(result.text)).toEqual({
      latex:
        '\\documentclass{article}\n\\begin{document}\nOpenRouter should be tried before Cohere when configured first in the provider order.\n\nThis payload is long enough to be accepted by the structured-output quality gate.\n\nA second paragraph makes the fallback output clearly complete so the chain stops before Cohere is attempted.\n\\end{document}',
    });
    expect(result.provider.attemptedProviders).toEqual(['gemini', 'openrouter']);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.any(Object),
    );
  });
});
