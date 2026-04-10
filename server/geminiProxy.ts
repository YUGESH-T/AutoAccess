import type { Plugin } from 'vite';
import { GoogleGenAI } from '@google/genai';
import type { GenerateContentResponse } from '@google/genai';
import { PROMPT_VERSION } from '../lib/promptVersion.js';
import { buildPrompt, buildContentParts, GEMINI_RESPONSE_SCHEMA } from '../lib/geminiPrompt.js';

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
          // Inject prompt version into the response
          try {
            const parsed = JSON.parse(cleaned);
            parsed._promptVersion = PROMPT_VERSION;
            res.end(JSON.stringify(parsed));
          } catch {
            res.end(cleaned);
          }
        } catch (err: any) {
          console.error('[gemini-api-proxy]', err);
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
