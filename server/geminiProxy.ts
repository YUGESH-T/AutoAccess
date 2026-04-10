import type { Plugin } from 'vite';
import { handleGenerate } from '../handlers/generateHandler.js';
import { handleCompile } from '../handlers/compileHandler.js';
import { APIError } from '../lib/errors.js';
import { parseJsonBody } from '../lib/parseBody.js';

/**
 * Vite dev-server plugin that proxies /api/generate and /api/compile to their handlers.
 *
 * Both routes use the SAME handler logic as the Vercel serverless functions in api/.
 * The API keys stay server-side — never shipped to the browser.
 */
export function geminiApiProxy(): Plugin {
  return {
    name: 'gemini-api-proxy',
    configureServer(server) {

      // ── /api/generate ──────────────────────────────────────────────────────
      server.middlewares.use('/api/generate', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        const requestId = crypto.randomUUID();

        try {
          const body = await parseJsonBody(req);
          const result = await handleGenerate(body as any, requestId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err: any) {
          console.error(`[gemini-api-proxy:generate:${requestId}]`, err.message || err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message || 'Gemini API error' }));
        }
      });

      // ── /api/compile ────────────────────────────────────────────────────────
      server.middlewares.use('/api/compile', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        const requestId = crypto.randomUUID();

        try {
          const body = await parseJsonBody(req);
          const result = await handleCompile(body as any, requestId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err: unknown) {
          if (err instanceof APIError) {
            res.writeHead(err.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, log: err.message }));
          } else {
            const message = err instanceof Error ? err.message : 'Compilation service error';
            console.error(`[compile-proxy:${requestId}]`, message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, log: message }));
          }
        }
      });
    },
  };
}
