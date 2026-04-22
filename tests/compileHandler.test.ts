import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCompile } from '../handlers/compileHandler';
import { ValidationError } from '../lib/errors';

describe('handleCompile', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.TEXAPI_API_KEY;

  beforeEach(() => {
    process.env.TEXAPI_API_KEY = 'test-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.TEXAPI_API_KEY = originalApiKey;
    vi.restoreAllMocks();
  });

  it('repairs missing environment endings before compilation', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      headers: {
        get: () => 'application/json',
      },
      json: async () => ({
        status: 'success',
        resultPath: '/files/output.pdf',
        errors: [],
      }),
    }).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer,
    });

    global.fetch = fetchMock as typeof fetch;

    const result = await handleCompile(
      {
        content: '\\begin{document}\n\\begin{itemize}\n\\item Hello\n\\end{document}',
      },
      'compile-1',
    );

    expect(result.success).toBe(true);
    expect(result.log).toContain('Automatic LaTeX fixes applied');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const compileBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(compileBody.content).toContain('\\end{itemize}');
  });

  it('rejects missing compile content', async () => {
    await expect(
      handleCompile(
        {
          content: null,
        },
        'compile-2',
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
