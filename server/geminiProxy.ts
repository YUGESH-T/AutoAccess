import type { Plugin } from 'vite';
import { GoogleGenAI } from '@google/genai';
import type { GenerateContentResponse } from '@google/genai';
import { PROMPT_VERSION } from '../lib/promptVersion';
import { buildPrompt, buildContentParts, GEMINI_RESPONSE_SCHEMA } from '../lib/geminiPrompt';

/**
 * Vite dev-server plugin that proxies /api/generate requests to Gemini.
 * The API key stays server-side — never shipped to the browser.
 */
export function geminiApiProxy(): Plugin {
  return {
    name: 'gemini-api-proxy',
    configureServer(server) {
      server.middlewares.use('/api/generate', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        // Read request body
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const { question, contextFile, removePlagiarism, temperature } = body;
        const temp = typeof temperature === 'number' && temperature >= 0 && temperature <= 2 ? temperature : 0.5;

        if (!question || typeof question !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing question field' }));
          return;
        }

        // File upload size guard — 4 MB base64 ≈ 5.33 MB raw
        if (contextFile?.base64 && contextFile.base64.length > 4 * 1024 * 1024 * 1.34) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Uploaded file exceeds 4 MB limit.' }));
          return;
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'GEMINI_API_KEY not set on server' }));
          return;
        }

        try {
          const ai = new GoogleGenAI({ apiKey });
          const model = 'gemini-2.5-flash';

          const promptText = buildPrompt({ question, contextFile, removePlagiarism: !!removePlagiarism });
          const contents = buildContentParts(promptText, contextFile);

          console.log(`[gemini-api-proxy] prompt=${PROMPT_VERSION} temp=${temp}`);
          const response: GenerateContentResponse = await ai.models.generateContent({
            model,
            contents: { parts: contents },
            config: {
              responseMimeType: 'application/json',
              responseSchema: GEMINI_RESPONSE_SCHEMA,
              temperature: temp,
            },
          });

          const text = response.text || '{}';
          // Strip markdown code fences if present
          const cleaned = text
            .replace(/^```(?:json)?\s*/, '')
            .replace(/\s*```$/, '')
            .trim();

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

      // ── /api/compile — Texapi LaTeX→PDF proxy ──
      server.middlewares.use('/api/compile', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const { content } = body;

        if (!content || typeof content !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing content field' }));
          return;
        }

        const texApiKey = process.env.TEXAPI_API_KEY;
        if (!texApiKey) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'TEXAPI_API_KEY not set on server' }));
          return;
        }

        try {
          // Wrap bare snippets
          let wrappedContent = content;
          if (!/\\documentclass/i.test(content)) {
            wrappedContent = [
              '\\documentclass{article}',
              '\\usepackage{amsmath,amssymb,graphicx,geometry}',
              '\\geometry{a4paper,margin=1in}',
              '\\begin{document}',
              content,
              '\\end{document}',
            ].join('\n');
          }

          // Step 1: Compile
          const compileRes = await fetch('https://texapi.ovh/api/latex/compile', {
            method: 'POST',
            headers: {
              'X-API-KEY': texApiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: wrappedContent }),
          });

          if (!compileRes.ok) {
            const errText = await compileRes.text();
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, errorType: 'service', log: `Texapi HTTP ${compileRes.status}: ${errText}` }));
            return;
          }

          const compileContentType = compileRes.headers.get('content-type') || '';

          // Texapi may return the PDF directly on success
          if (compileContentType.includes('application/pdf')) {
            const pdfBuffer = Buffer.from(await compileRes.arrayBuffer());
            const pdfBase64 = pdfBuffer.toString('base64');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, pdfBase64, log: 'Compilation successful.' }));
            return;
          }

          // Otherwise parse JSON for two-step flow or error
          const result = await compileRes.json() as {
            status: string;
            errors: string[];
            resultPath: string | null;
          };

          if (result.status !== 'success' || !result.resultPath) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              errorType: 'syntax',
              log: result.errors?.join('\n') || 'Compilation failed.',
            }));
            return;
          }

          // Step 2: Download PDF
          const fileKey = result.resultPath.split('/').pop();
          const pdfRes = await fetch(`https://texapi.ovh/api/latex/files/${fileKey}`, {
            method: 'GET',
            headers: { 'X-API-KEY': texApiKey },
          });

          if (!pdfRes.ok) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, errorType: 'service', log: `PDF download failed (HTTP ${pdfRes.status}).` }));
            return;
          }

          const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
          const pdfBase64 = pdfBuffer.toString('base64');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, pdfBase64, log: 'Compilation successful.' }));
        } catch (err: any) {
          console.error('[texapi-compile-proxy]', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, log: err.message || 'Compilation service error.' }));
        }
      });
    },
  };
}
