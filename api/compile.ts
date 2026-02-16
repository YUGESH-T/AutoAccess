import type { IncomingMessage, ServerResponse } from 'node:http';

/** Vercel-compatible request with parsed body */
interface ApiRequest extends IncomingMessage {
  body: Record<string, any>;
  method: string;
}

/** Vercel-compatible response with helper methods */
interface ApiResponse extends ServerResponse {
  status(code: number): ApiResponse;
  json(data: unknown): void;
  send(body: Buffer | string): void;
  setHeader(name: string, value: string): this;
}

// Vercel Hobby (free) tier: max 60s function duration
export const config = {
  maxDuration: 60,
};

const TEXAPI_COMPILE = 'https://texapi.ovh/api/latex/compile';
const TEXAPI_FILES = 'https://texapi.ovh/api/latex/files';

/**
 * Wraps bare LaTeX snippets in a minimal document structure.
 */
function ensureDocumentWrapper(code: string): string {
  if (/\\documentclass/i.test(code)) return code;
  return [
    '\\documentclass{article}',
    '\\usepackage{amsmath,amssymb,graphicx,geometry}',
    '\\geometry{a4paper,margin=1in}',
    '\\begin{document}',
    code,
    '\\end{document}',
  ].join('\n');
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { content } = req.body;
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Missing content field' });
  }

  const apiKey = process.env.TEXAPI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'TEXAPI_API_KEY not set on server' });
  }

  try {
    const wrappedContent = ensureDocumentWrapper(content);

    // Step 1: Compile LaTeX
    const compileRes = await fetch(TEXAPI_COMPILE, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: wrappedContent }),
    });

    if (!compileRes.ok) {
      const errText = await compileRes.text();
      return res.status(502).json({
        error: `Texapi returned HTTP ${compileRes.status}`,
        log: errText,
      });
    }

    const compileContentType = compileRes.headers.get('content-type') || '';

    // Texapi may return the PDF directly on success
    if (compileContentType.includes('application/pdf')) {
      const pdfBuffer = Buffer.from(await compileRes.arrayBuffer());
      const pdfBase64 = pdfBuffer.toString('base64');
      return res.status(200).json({ success: true, pdfBase64, log: 'Compilation successful.' });
    }

    // Otherwise parse JSON for two-step flow or error
    const result = await compileRes.json() as {
      status: string;
      errors: string[];
      resultPath: string | null;
      outputFiles: { type: string; content: string }[] | null;
    };

    if (result.status !== 'success' || !result.resultPath) {
      return res.status(200).json({
        success: false,
        log: result.errors?.join('\n') || 'Compilation failed — no error details returned.',
      });
    }

    // Step 2: Download the PDF using resultPath
    // resultPath is like "/api/latex/files/{key}" — extract the file key
    const fileKey = result.resultPath.split('/').pop();
    const pdfRes = await fetch(`${TEXAPI_FILES}/${fileKey}`, {
      method: 'GET',
      headers: { 'X-API-KEY': apiKey },
    });

    if (!pdfRes.ok) {
      return res.status(502).json({
        success: false,
        log: `Failed to download PDF (HTTP ${pdfRes.status}).`,
      });
    }

    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
    const pdfBase64 = pdfBuffer.toString('base64');
    return res.status(200).json({ success: true, pdfBase64, log: 'Compilation successful.' });
  } catch (err: any) {
    console.error('[api/compile]', err);
    return res.status(500).json({
      success: false,
      log: err.message || 'Compilation service error.',
    });
  }
}
