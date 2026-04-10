import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleGenerate } from '../handlers/generateHandler.js';
import { APIError } from '../lib/errors.js';

/** Vercel-compatible request/response interfaces */
interface ApiRequest extends IncomingMessage {
  body: Record<string, unknown>;
  method: string;
}
interface ApiResponse extends ServerResponse {
  status(code: number): ApiResponse;
  json(data: unknown): void;
}

// Vercel Hobby tier: max 60s function duration
export const config = { maxDuration: 60 };

/**
 * Thin Vercel route wrapper — delegates all logic to handlers/generateHandler.ts.
 * Includes post-processing for LaTeX delimiters.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const requestId = crypto.randomUUID();

  try {
    const result = await handleGenerate(req.body as any, requestId);
    return res.status(200).json(result);
  } catch (err: unknown) {
    if (err instanceof APIError) {
      return res.status(err.status).json({ error: err.message });
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error(`[api/generate:${requestId}]`, message);
    return res.status(500).json({ error: message });
  }
}
