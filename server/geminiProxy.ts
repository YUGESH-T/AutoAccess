import type { Plugin } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import type { GenerateContentResponse } from '@google/genai';

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
        const { question, contextFile, removePlagiarism } = body;

        if (!question || typeof question !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing question field' }));
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

          let promptText = `You are an expert academic assistant specializing in LaTeX formatting. Your task is to answer the following assignment question comprehensively`;

          if (contextFile) {
            promptText += `, using the attached "${contextFile.name}" as the primary context and source material`;
          }

          promptText += `.

Your entire output **MUST** be a single, valid JSON object that adheres to the provided schema. Do not include any text or markdown formatting outside of the JSON object.

The JSON object must have one key:
1.  \`latex_code\`: A string containing the full, well-structured answer formatted in valid LaTeX. This should be a complete LaTeX document structure, including \\documentclass, \\begin{document}, title, sections, etc.

**CRITICAL FORMATTING RULE**: The \`latex_code\` string MUST contain proper newline characters (\\n) between LaTeX commands. Each \\documentclass, \\usepackage, \\begin, \\end, \\section, \\subsection, \\item, equation environments, and paragraph breaks must be on separate lines. The output must be human-readable LaTeX source code, NOT a single compressed line. For example:
- Put each \\usepackage on its own line
- Put \\begin{document} on its own line
- Put each \\section and \\subsection on its own line
- Add a blank line between paragraphs
- Put each \\item on its own line
- Put \\end{document} on its own line

Instructions for your response:
-   **LaTeX Content**: Create a thorough and clear answer to the user's question. Use appropriate LaTeX commands for formatting, such as \\section, \\subsection, \\itemize, \\enumerate, mathematical equations ($...$ or $$...$$), etc.
-   **Do NOT include any \\includegraphics commands or figure environments.**
-   **Anti-Plagiarism / Text Formatting**: You **MUST** include \`\\usepackage{xcolor}\` in the document preamble. Immediately after \`\\begin{document}\`, define a dark grey/off-black color (e.g., \`\\definecolor{customblack}{RGB}{30,30,30}\`) and apply it globally using \`\\color{customblack}\`. This is a mandatory step to ensure the text is not pure black #000000.
`;

          if (removePlagiarism) {
            promptText += `
-   **Plagiarism Prevention Guidelines (ENABLED)**:
    -   **Paraphrasing**: Rewrite the content completely in your own professional words rather than just changing the appearance.
    -   **Accuracy**: Preserve the original meaning and technical accuracy.
    -   **Tone**: Use a proper academic tone.
    -   **Quotation Marks**: If you must use a direct copy of a phrase or sentence, wrap it in quotes.
    -   **Proper Citation**: Use the \`thebibliography\` environment at the end of the document for citations. Ensure all references are self-contained within the .tex file (do not use external .bib files). Use \`\\cite{...}\` within the text to attribute sources correctly.
`;
          } else {
            promptText += `
-   **Content Fidelity (PLAGIARISM REMOVAL DISABLED)**:
    -   Keep the content as close to the original (if context is provided) or standard definitions as possible.
    -   Do not paraphrase unnecessarily.
    -   Only fix grammar, formatting, or LaTeX structure if required.
`;
          }

          promptText += `

Here is the user's assignment question:
"${question}"`;

          const schema = {
            type: Type.OBJECT,
            properties: {
              latex_code: {
                type: Type.STRING,
                description: 'The full LaTeX document as a properly formatted string with newline characters between commands. Must be human-readable, not a single compressed line.',
              },
            },
            required: ['latex_code'],
          };

          const contents: any[] = [{ text: promptText }];

          if (contextFile) {
            contents.push({
              inlineData: {
                mimeType: contextFile.mimeType,
                data: contextFile.base64,
              },
            });
          }

          const response: GenerateContentResponse = await ai.models.generateContent({
            model,
            contents: { parts: contents },
            config: {
              responseMimeType: 'application/json',
              responseSchema: schema,
              temperature: 0.5,
            },
          });

          const text = response.text || '{}';
          // Strip markdown code fences if present
          const cleaned = text
            .replace(/^```(?:json)?\s*/, '')
            .replace(/\s*```$/, '')
            .trim();

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(cleaned);
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
            res.end(JSON.stringify({ success: false, log: `Texapi HTTP ${compileRes.status}: ${errText}` }));
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
            res.end(JSON.stringify({ success: false, log: `PDF download failed (HTTP ${pdfRes.status}).` }));
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
