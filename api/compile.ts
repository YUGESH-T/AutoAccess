import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleCompile } from '../handlers/compileHandler.js';
import type { CompileInput } from '../handlers/compileHandler.js';
import { MethodNotAllowedError, toApiErrorResponse } from '../lib/errors.js';

interface ApiRequest extends IncomingMessage {
  body: Record<string, unknown>;
  method: string;
}

interface ApiResponse extends ServerResponse {
  status(code: number): ApiResponse;
  json(data: unknown): void;
}

export const config = { maxDuration: 60 };

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    const { status, body } = toApiErrorResponse(new MethodNotAllowedError());
    return res.status(status).json(body);
  }

  const requestId = crypto.randomUUID();

  try {
    const result = await handleCompile(req.body as unknown as CompileInput, requestId);
    return res.status(200).json(result);
  } catch (err: unknown) {
    const { status, body } = toApiErrorResponse(err);
    console.error(`[api/compile:${requestId}]`, body.error.message);
    return res.status(status).json(body);
  }
}
