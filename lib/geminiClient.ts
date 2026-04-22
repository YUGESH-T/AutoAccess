import { GoogleGenAI } from '@google/genai';
import type { GenerateContentResponse } from '@google/genai';
import pLimit from 'p-limit';
import { buildPrompt, buildContentParts, GEMINI_RESPONSE_SCHEMA } from './geminiPrompt.js';
import {
  ConfigurationError,
  RateLimitError,
  UpstreamServiceError,
} from './errors.js';

/**
 * Pure Gemini API caller with production-grade reliability:
 *   - Concurrency control (p-limit, max 2 parallel calls)
 *   - Retry with exponential backoff (2 retries, 800ms -> 1600ms)
 *   - Fallback model (gemini-2.5-flash-lite if primary overloaded)
 *   - Circuit breaker (fail fast after 5 consecutive failures)
 */

export interface GeminiInput {
  question: string;
  contextFile?: { name: string; mimeType: string; base64: string } | null;
  removePlagiarism: boolean;
  temperature: number;
}

const PRIMARY_MODEL = 'gemini-2.5-flash';
const FALLBACK_MODEL = 'gemini-2.5-flash-lite';
const limit = pLimit(2);

let failureCount = 0;
let lastFailureTime = 0;
const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_RESET_MS = 30_000;

function isCircuitOpen(): boolean {
  return failureCount >= CIRCUIT_THRESHOLD && Date.now() - lastFailureTime < CIRCUIT_RESET_MS;
}

function classifyUpstreamError(error: unknown): Error {
  const message = error instanceof Error ? error.message : 'Gemini API call failed';
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('429') || lowerMessage.includes('rate limit') || lowerMessage.includes('quota')) {
    return new RateLimitError('Gemini rate limit reached. Please try again shortly.');
  }

  if (lowerMessage.includes('503') || lowerMessage.includes('overloaded')) {
    return new UpstreamServiceError('Gemini is temporarily overloaded.', 503, 'GEMINI_UNAVAILABLE');
  }

  return new UpstreamServiceError(message, 502, 'GEMINI_UPSTREAM_ERROR');
}

function shouldRetry(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('overloaded') ||
    msg.includes('rate limit') ||
    msg.includes('quota')
  );
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 2,
  delayMs = 800,
): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    if (retries === 0 || !shouldRetry(err)) throw err;
    console.warn(`[gemini] transient failure, retrying in ${delayMs}ms (${retries} left)`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return retryWithBackoff(fn, retries - 1, delayMs * 2);
  }
}

function isTruncated(s: string): boolean {
  const missingEnd = !s.includes('\\end{document}');
  const oddDollar = (s.match(/\$/g) || []).length % 2 !== 0;
  const oddDisplay = ((s.match(/\\\[/g) || []).length - (s.match(/\\\]/g) || []).length) > 0;
  const tailCut = /\\[a-zA-Z]*$/.test(s);
  const tooShort = s.length < 300;

  return missingEnd || oddDollar || oddDisplay || tailCut || tooShort;
}

async function callGeminiModel(
  ai: GoogleGenAI,
  model: string,
  input: GeminiInput,
  requestId: string,
  maxOutputTokens = 8192,
): Promise<string> {
  const promptText = buildPrompt(input);
  const contents = buildContentParts(promptText, input.contextFile);

  let response: GenerateContentResponse;
  try {
    response = await ai.models.generateContent({
      model,
      contents: { parts: contents },
      config: {
        responseMimeType: 'application/json',
        responseSchema: GEMINI_RESPONSE_SCHEMA,
        temperature: input.temperature,
        maxOutputTokens,
      },
    });
  } catch (err: unknown) {
    throw classifyUpstreamError(err);
  }

  const text = response.text || '{}';
  return text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
}

async function callWithEscalation(
  ai: GoogleGenAI,
  model: string,
  input: GeminiInput,
  requestId: string,
): Promise<string> {
  const first = await callGeminiModel(ai, model, input, requestId, 8192);

  if (isTruncated(first)) {
    console.warn(`[gemini:${requestId}] output truncated (len=${first.length}), escalating to 16k tokens`);
    return callGeminiModel(ai, model, input, requestId, 16384);
  }

  return first;
}

async function callWithFallback(
  ai: GoogleGenAI,
  input: GeminiInput,
  requestId: string,
): Promise<string> {
  try {
    return await callWithEscalation(ai, PRIMARY_MODEL, input, requestId);
  } catch (err: unknown) {
    if (shouldRetry(err)) {
      console.warn(
        `[gemini:${requestId}] primary (${PRIMARY_MODEL}) unavailable, switching to fallback (${FALLBACK_MODEL})`,
      );
      return callWithEscalation(ai, FALLBACK_MODEL, input, requestId);
    }
    throw err;
  }
}

export async function callGemini(input: GeminiInput, requestId: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ConfigurationError('GEMINI_API_KEY is not configured on the server.');
  }

  if (isCircuitOpen()) {
    throw new UpstreamServiceError(
      'The AI service is temporarily overloaded. Please try again in 30 seconds.',
      503,
      'GEMINI_CIRCUIT_OPEN',
    );
  }

  console.log(
    `[gemini:${requestId}] gen start temp=${input.temperature} ctx=${!!input.contextFile} circuit=${failureCount}/${CIRCUIT_THRESHOLD}`,
  );

  const ai = new GoogleGenAI({ apiKey });

  try {
    const result = await limit(() => retryWithBackoff(() => callWithFallback(ai, input, requestId)));
    failureCount = 0;
    console.log(`[gemini:${requestId}] gen done len=${result.length}`);
    return result;
  } catch (err: unknown) {
    failureCount++;
    lastFailureTime = Date.now();
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[gemini:${requestId}] failed circuit=${failureCount}/${CIRCUIT_THRESHOLD} ${message}`,
    );
    throw err;
  }
}
