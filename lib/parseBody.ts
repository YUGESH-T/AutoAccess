import type { IncomingMessage } from 'node:http';
import { ValidationError } from './errors.js';

/**
 * Reads and JSON-parses the body of a Node IncomingMessage (Vite dev middleware).
 * Extracted from server/geminiProxy.ts where it was duplicated for each route.
 */
export async function parseJsonBody<T = Record<string, unknown>>(
  req: IncomingMessage,
): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString()) as T;
  } catch {
    throw new ValidationError('Request body must be valid JSON.', 'INVALID_JSON');
  }
}
