import type { IncomingMessage, ServerResponse } from 'node:http';
import { GoogleGenAI } from '@google/genai';
import type { GenerateContentResponse } from '@google/genai';
import { PROMPT_VERSION } from '../lib/promptVersion';
import { buildPrompt, buildContentParts, GEMINI_RESPONSE_SCHEMA } from '../lib/geminiPrompt';

/** Vercel-compatible request with parsed body */
interface ApiRequest extends IncomingMessage {
  body: Record<string, any>;
  method: string;
}

/** Vercel-compatible response with helper methods */
interface ApiResponse extends ServerResponse {
  status(code: number): ApiResponse;
  json(data: unknown): void;
}

// Vercel Hobby (free) tier: max 60s function duration
export const config = {
  maxDuration: 60,
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question, contextFile, removePlagiarism, temperature } = req.body;
  const temp = typeof temperature === 'number' && temperature >= 0 && temperature <= 2 ? temperature : 0.5;

  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Missing question field' });
  }

  // File upload size guard — 4 MB base64 ≈ 5.33 MB raw
  if (contextFile?.base64 && contextFile.base64.length > 4 * 1024 * 1024 * 1.34) {
    return res.status(413).json({ error: 'Uploaded file exceeds 4 MB limit.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not set on server' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const model = 'gemini-2.5-flash';

    const promptText = buildPrompt({ question, contextFile, removePlagiarism: !!removePlagiarism });
    const contents = buildContentParts(promptText, contextFile);

    console.log(`[api/generate] prompt=${PROMPT_VERSION} temp=${temp}`);
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

    const parsed = JSON.parse(cleaned);
    parsed._promptVersion = PROMPT_VERSION;
    return res.status(200).json(parsed);
  } catch (err: any) {
    console.error('[api/generate]', err);
    return res.status(500).json({ error: err.message || 'Gemini API error' });
  }
}
