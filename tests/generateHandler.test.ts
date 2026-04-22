import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleGenerate } from '../handlers/generateHandler';
import { MAX_FILE_SIZE_BASE64_LENGTH } from '../lib/constants';
import { AIContractError, PayloadTooLargeError, toApiErrorResponse } from '../lib/errors';

vi.mock('../lib/geminiClient', () => ({
  callGemini: vi.fn(),
}));

import { callGemini } from '../lib/geminiClient';

describe('handleGenerate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cleaned latex for a valid request', async () => {
    vi.mocked(callGemini).mockResolvedValueOnce({
      text: JSON.stringify({ latex: '\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}' }),
      provider: {
        name: 'gemini',
        model: 'gemini-2.5-flash',
        latencyMs: 1200,
        fallbackUsed: false,
        attemptedProviders: ['gemini'],
      },
    });

    const result = await handleGenerate(
      {
        question: 'Explain photosynthesis',
        removePlagiarism: false,
      },
      'req-1',
    );

    expect(result.latex).toContain('\\begin{document}');
    expect(result._promptVersion).toBeDefined();
    expect(result.fixes).toEqual([]);
    expect(result.provider?.name).toBe('gemini');
    expect(result.timeline.map((step) => step.label)).toEqual([
      'Generating',
      'Provider: Gemini',
      'Ready to compile',
    ]);
  });

  it('rejects malformed AI responses', async () => {
    vi.mocked(callGemini).mockResolvedValueOnce({
      text: JSON.stringify({ latex_code: 'bad' }),
      provider: {
        name: 'gemini',
        model: 'gemini-2.5-flash',
        latencyMs: 500,
        fallbackUsed: false,
        attemptedProviders: ['gemini'],
      },
    });

    await expect(
      handleGenerate(
        {
          question: 'Explain photosynthesis',
        },
        'req-2',
      ),
    ).rejects.toBeInstanceOf(AIContractError);
  });

  it('auto-repairs common LaTeX environment issues', async () => {
    vi.mocked(callGemini).mockResolvedValueOnce(
      {
        text: JSON.stringify({
          latex: '\\documentclass{article}\n\\begin{document}\n\\begin{itemize}\n\\item Hello\n\\end{document}',
        }),
        provider: {
          name: 'openrouter',
          model: 'openai/gpt-4o-mini',
          latencyMs: 2200,
          fallbackUsed: true,
          attemptedProviders: ['gemini', 'openrouter'],
        },
      },
    );

    const result = await handleGenerate(
      {
        question: 'Explain photosynthesis',
      },
      'req-2b',
    );

    expect(result.latex).toContain('\\end{itemize}');
    expect(result.latex.trim().endsWith('\\end{document}')).toBe(true);
    expect(result.fixes).toContain('Inserted missing \\end{itemize} before \\end{document}.');
    expect(result.provider?.fallbackUsed).toBe(true);
    expect(result.timeline.map((step) => step.label)).toContain('Fallback used');
    expect(result.timeline.map((step) => step.label)).toContain('LaTeX repaired');
  });

  it('rejects oversized files', async () => {
    await expect(
      handleGenerate(
        {
          question: 'Explain photosynthesis',
          contextFile: {
            name: 'big.pdf',
            mimeType: 'application/pdf',
            base64: 'a'.repeat(MAX_FILE_SIZE_BASE64_LENGTH + 1),
          },
        },
        'req-3',
      ),
    ).rejects.toBeInstanceOf(PayloadTooLargeError);
  });
});

describe('toApiErrorResponse', () => {
  it('formats API errors consistently', () => {
    const result = toApiErrorResponse(new PayloadTooLargeError('Too big', 'FILE_TOO_LARGE'));

    expect(result.status).toBe(413);
    expect(result.body).toEqual({
      error: {
        message: 'Too big',
        code: 'FILE_TOO_LARGE',
      },
    });
  });
});
