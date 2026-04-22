import type { ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { handleGenerate } from '../handlers/generateHandler.js';
import type { GenerateInput } from '../handlers/generateHandler.js';
import { handleCompile } from '../handlers/compileHandler.js';
import type { CompileInput } from '../handlers/compileHandler.js';
import { MethodNotAllowedError, toApiErrorResponse } from '../lib/errors.js';
import { parseJsonBody } from '../lib/parseBody.js';

function writeJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * Vite dev-server plugin that proxies /api/generate and /api/compile to their handlers.
 *
 * Both routes use the SAME handler logic as the Vercel serverless functions in api/.
 * The API keys stay server-side and never reach the browser.
 */
export function geminiApiProxy(): Plugin {
  return {
    name: 'gemini-api-proxy',
    configureServer(server) {
      server.middlewares.use('/api/generate', async (req, res) => {
        if (req.method !== 'POST') {
          const { status, body } = toApiErrorResponse(new MethodNotAllowedError());
          writeJson(res, status, body);
          return;
        }

        const requestId = crypto.randomUUID();

        try {
          const body = await parseJsonBody(req);
          const result = await handleGenerate(body as unknown as GenerateInput, requestId);
          writeJson(res, 200, result);
        } catch (err: unknown) {
          const { status, body } = toApiErrorResponse(err);
          console.error(`[gemini-api-proxy:generate:${requestId}]`, body.error.message);
          writeJson(res, status, body);
        }
      });

      server.middlewares.use('/api/compile', async (req, res) => {
        if (req.method !== 'POST') {
          const { status, body } = toApiErrorResponse(new MethodNotAllowedError());
          writeJson(res, status, body);
          return;
        }

        const requestId = crypto.randomUUID();

        try {
          const body = await parseJsonBody(req);
          const result = await handleCompile(body as unknown as CompileInput, requestId);
          writeJson(res, 200, result);
        } catch (err: unknown) {
          const { status, body } = toApiErrorResponse(err);
          console.error(`[compile-proxy:${requestId}]`, body.error.message);
          writeJson(res, status, body);
        }
      });
    },
  };
}
