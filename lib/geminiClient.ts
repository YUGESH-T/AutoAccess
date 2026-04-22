import { GoogleGenAI } from '@google/genai';
import type { GenerateContentResponse } from '@google/genai';
import pLimit from 'p-limit';
import { buildPrompt, buildContentParts, GEMINI_RESPONSE_SCHEMA } from './geminiPrompt.js';
import {
  AIContractError,
  ConfigurationError,
  RateLimitError,
  UpstreamServiceError,
} from './errors.js';

/**
 * Backward-compatible export name.
 * Internally this is now a tiered provider chain:
 *   Gemini -> OpenRouter -> Cohere
 */

export interface GeminiInput {
  question: string;
  contextFile?: { name: string; mimeType: string; base64: string } | null;
  removePlagiarism: boolean;
  temperature: number;
}

export interface AIProviderInfo {
  name: ProviderName;
  model: string;
  latencyMs: number;
  fallbackUsed: boolean;
  attemptedProviders: ProviderName[];
}

export interface AIProviderCallResult {
  text: string;
  provider: AIProviderInfo;
}

type ProviderName = 'gemini' | 'cohere' | 'openrouter';

interface ProviderDefinition {
  name: ProviderName;
  model: () => string;
  isConfigured: () => boolean;
  supportsInput: (input: GeminiInput) => boolean;
  call: (input: GeminiInput, requestId: string) => Promise<string>;
}

const GEMINI_PRIMARY_MODEL = 'gemini-2.5-flash';
const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_COHERE_MODEL = 'command-a-03-2025';
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_PROVIDER_ORDER = 'gemini,openrouter,cohere';
const DEFAULT_GEMINI_TIMEOUT_MS = 18_000;
const DEFAULT_COHERE_TIMEOUT_MS = 6_000;
const DEFAULT_OPENROUTER_TIMEOUT_MS = 6_000;
const limit = pLimit(2);

let failureCount = 0;
let lastFailureTime = 0;
const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_RESET_MS = 30_000;
const PROVIDER_COOLDOWN_MS = 120_000;
const PROVIDER_FAILURE_THRESHOLD = 2;

type ProviderHealthState = {
  consecutiveFailures: number;
  cooldownUntil: number;
  lastLatencyMs?: number;
  lastError?: string;
};

const providerHealth: Record<ProviderName, ProviderHealthState> = {
  gemini: { consecutiveFailures: 0, cooldownUntil: 0 },
  cohere: { consecutiveFailures: 0, cooldownUntil: 0 },
  openrouter: { consecutiveFailures: 0, cooldownUntil: 0 },
};

export function resetAIProviderHealthForTest() {
  failureCount = 0;
  lastFailureTime = 0;
  for (const provider of Object.keys(providerHealth) as ProviderName[]) {
    providerHealth[provider] = {
      consecutiveFailures: 0,
      cooldownUntil: 0,
    };
  }
}

function getCohereModel(): string {
  return process.env.COHERE_MODEL || DEFAULT_COHERE_MODEL;
}

function getOpenRouterModel(): string {
  return process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
}

function getProviderOrder(): ProviderName[] {
  const requested = (process.env.AI_PROVIDER_ORDER || DEFAULT_PROVIDER_ORDER)
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const seen = new Set<ProviderName>();
  const ordered: ProviderName[] = [];

  for (const value of requested) {
    if (
      (value === 'gemini' || value === 'cohere' || value === 'openrouter') &&
      !seen.has(value)
    ) {
      seen.add(value);
      ordered.push(value);
    }
  }

  for (const value of ['gemini', 'openrouter', 'cohere'] as const) {
    if (!seen.has(value)) {
      ordered.push(value);
    }
  }

  return ordered;
}

function getTimeoutMs(provider: ProviderName): number {
  const envValue =
    provider === 'gemini'
      ? process.env.GEMINI_TIMEOUT_MS
      : provider === 'cohere'
        ? process.env.COHERE_TIMEOUT_MS
        : process.env.OPENROUTER_TIMEOUT_MS;

  const parsed = Number(envValue);
  if (Number.isFinite(parsed) && parsed >= 1000) {
    return parsed;
  }

  switch (provider) {
    case 'gemini':
      return DEFAULT_GEMINI_TIMEOUT_MS;
    case 'cohere':
      return DEFAULT_COHERE_TIMEOUT_MS;
    case 'openrouter':
      return DEFAULT_OPENROUTER_TIMEOUT_MS;
  }
}

function isProviderOnCooldown(provider: ProviderName): boolean {
  return providerHealth[provider].cooldownUntil > Date.now();
}

function markProviderSuccess(provider: ProviderName, latencyMs: number) {
  providerHealth[provider] = {
    consecutiveFailures: 0,
    cooldownUntil: 0,
    lastLatencyMs: latencyMs,
  };
}

function markProviderFailure(provider: ProviderName, error: unknown) {
  const current = providerHealth[provider];
  const nextFailures = current.consecutiveFailures + 1;
  const shouldCooldown = nextFailures >= PROVIDER_FAILURE_THRESHOLD;

  providerHealth[provider] = {
    consecutiveFailures: shouldCooldown ? 0 : nextFailures,
    cooldownUntil: shouldCooldown ? Date.now() + PROVIDER_COOLDOWN_MS : current.cooldownUntil,
    lastLatencyMs: current.lastLatencyMs,
    lastError: error instanceof Error ? error.message : String(error),
  };

  if (shouldCooldown) {
    console.warn(
      `[ai:health] provider=${provider} cooling down for ${Math.round(PROVIDER_COOLDOWN_MS / 1000)}s after repeated failures`,
    );
  }
}

function isCircuitOpen(): boolean {
  return failureCount >= CIRCUIT_THRESHOLD && Date.now() - lastFailureTime < CIRCUIT_RESET_MS;
}

function normalizeResponseText(text: string): string {
  return text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
}

function isStructuredLatexResponse(text: string): boolean {
  try {
    const parsed = JSON.parse(normalizeResponseText(text)) as { latex?: unknown };
    return typeof parsed?.latex === 'string';
  } catch {
    return false;
  }
}

function validateProviderResponse(text: string): string {
  const normalized = normalizeResponseText(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new AIContractError('AI provider returned invalid JSON.', 'AI_INVALID_JSON');
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('latex' in parsed) ||
    typeof (parsed as { latex: unknown }).latex !== 'string'
  ) {
    throw new AIContractError(
      'AI provider returned malformed structured output.',
      'AI_INVALID_SCHEMA',
    );
  }

  const latex = (parsed as { latex: string }).latex;
  if (isTruncated(latex)) {
    throw new AIContractError('AI provider returned incomplete LaTeX output.', 'AI_OUTPUT_INCOMPLETE');
  }

  return normalized;
}

function classifyUpstreamError(error: unknown, provider: ProviderName): Error {
  const message = error instanceof Error ? error.message : `${provider} API call failed`;
  const lowerMessage = message.toLowerCase();
  const providerLabel = provider.charAt(0).toUpperCase() + provider.slice(1);

  if (
    lowerMessage.includes('429') ||
    lowerMessage.includes('rate limit') ||
    lowerMessage.includes('quota') ||
    lowerMessage.includes('too many requests')
  ) {
    return new RateLimitError(`${providerLabel} rate limit reached. Please try again shortly.`);
  }

  if (
    lowerMessage.includes('503') ||
    lowerMessage.includes('overloaded') ||
    lowerMessage.includes('temporarily unavailable') ||
    lowerMessage.includes('capacity')
  ) {
    return new UpstreamServiceError(
      `${providerLabel} is temporarily overloaded.`,
      503,
      `${provider.toUpperCase()}_UNAVAILABLE`,
    );
  }

  return new UpstreamServiceError(message, 502, `${provider.toUpperCase()}_UPSTREAM_ERROR`);
}

function classifyHttpFailure(provider: ProviderName, status: number, bodyText: string): Error {
  return classifyUpstreamError(
    new Error(`${provider} request failed (${status}): ${bodyText}`),
    provider,
  );
}

async function fetchWithTimeout(
  provider: ProviderName,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = getTimeoutMs(provider);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new UpstreamServiceError(
        `${provider.charAt(0).toUpperCase() + provider.slice(1)} timed out after ${timeoutMs}ms.`,
        504,
        `${provider.toUpperCase()}_TIMEOUT`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
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
    msg.includes('temporarily unavailable') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('timeout')
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
    console.warn(`[ai] transient failure, retrying in ${delayMs}ms (${retries} left)`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return retryWithBackoff(fn, retries - 1, delayMs * 2);
  }
}

function isTruncated(s: string): boolean {
  const missingEnd = !s.includes('\\end{document}');
  const oddDollar = (s.match(/\$/g) || []).length % 2 !== 0;
  const oddDisplay = (s.match(/\\\[/g) || []).length > (s.match(/\\\]/g) || []).length;
  const tailCut = /\\[a-zA-Z]*$/.test(s);
  const tooShort = s.trim().length < 300;

  return missingEnd || oddDollar || oddDisplay || tailCut || tooShort;
}

function decodeTextContext(input: GeminiInput): string | null {
  if (!input.contextFile || input.contextFile.mimeType !== 'text/plain') {
    return null;
  }

  try {
    return Buffer.from(input.contextFile.base64, 'base64').toString('utf8').slice(0, 20_000);
  } catch {
    return null;
  }
}

function buildTextOnlyPrompt(input: GeminiInput): string {
  const prompt = buildPrompt(input);
  const decodedContext = decodeTextContext(input);

  if (!decodedContext) {
    return prompt;
  }

  return `${prompt}

TEXT CONTEXT FROM "${input.contextFile?.name}"
Use this text as additional source material when relevant:
"""
${decodedContext}
"""`;
}

async function callGeminiModel(
  ai: GoogleGenAI,
  model: string,
  input: GeminiInput,
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
    throw classifyUpstreamError(err, 'gemini');
  }

  return normalizeResponseText(response.text || '{}');
}

async function callGeminiWithEscalation(ai: GoogleGenAI, input: GeminiInput, requestId: string): Promise<string> {
  const first = await callGeminiModel(ai, GEMINI_PRIMARY_MODEL, input, 8192);

  if (!isStructuredLatexResponse(first)) {
    return first;
  }

  const latex = JSON.parse(first) as { latex: string };
  if (!isTruncated(latex.latex)) {
    return first;
  }

  console.warn(
    `[ai:${requestId}] gemini output looked incomplete, retrying with ${GEMINI_FALLBACK_MODEL} at a higher token budget`,
  );

  return callGeminiModel(ai, GEMINI_FALLBACK_MODEL, input, 16_384);
}

async function callCohere(input: GeminiInput): Promise<string> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) {
    throw new ConfigurationError('COHERE_API_KEY is not configured on the server.', 'COHERE_NOT_CONFIGURED');
  }

  const response = await fetchWithTimeout('cohere', 'https://api.cohere.ai/v2/chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getCohereModel(),
      temperature: input.temperature,
      messages: [
        {
          role: 'user',
          content: buildTextOnlyPrompt(input),
        },
      ],
      response_format: {
        type: 'json_object',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            latex: {
              type: 'string',
              description: 'A complete valid LaTeX document.',
            },
          },
          required: ['latex'],
        },
      },
    }),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw classifyHttpFailure('cohere', response.status, bodyText);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new AIContractError('Cohere returned invalid JSON.', 'COHERE_INVALID_JSON');
  }

  const text = (parsed as { message?: { content?: Array<{ text?: string }> } })?.message?.content?.[0]
    ?.text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new AIContractError('Cohere returned an empty response.', 'COHERE_EMPTY_RESPONSE');
  }

  return normalizeResponseText(text);
}

function extractOpenRouterText(payload: unknown): string | null {
  const content = (payload as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
    }>;
  })?.choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const combined = content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();
    return combined || null;
  }

  return null;
}

async function callOpenRouter(input: GeminiInput): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new ConfigurationError(
      'OPENROUTER_API_KEY is not configured on the server.',
      'OPENROUTER_NOT_CONFIGURED',
    );
  }

  const response = await fetchWithTimeout('openrouter', 'https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getOpenRouterModel(),
      temperature: input.temperature,
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: buildTextOnlyPrompt(input),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'latex_document',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              latex: {
                type: 'string',
                description: 'A complete valid LaTeX document.',
              },
            },
            required: ['latex'],
          },
        },
      },
    }),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw classifyHttpFailure('openrouter', response.status, bodyText);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new AIContractError('OpenRouter returned invalid JSON.', 'OPENROUTER_INVALID_JSON');
  }

  const text = extractOpenRouterText(parsed);
  if (!text) {
    throw new AIContractError('OpenRouter returned an empty response.', 'OPENROUTER_EMPTY_RESPONSE');
  }

  return normalizeResponseText(text);
}

function createProviders(): ProviderDefinition[] {
  const providerMap: Record<ProviderName, ProviderDefinition> = {
    gemini: {
      name: 'gemini',
      model: () => GEMINI_PRIMARY_MODEL,
      isConfigured: () => Boolean(process.env.GEMINI_API_KEY),
      supportsInput: () => true,
      call: async (input, requestId) => {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          throw new ConfigurationError(
            'GEMINI_API_KEY is not configured on the server.',
            'GEMINI_NOT_CONFIGURED',
          );
        }

        const ai = new GoogleGenAI({ apiKey });
        return callGeminiWithEscalation(ai, input, requestId);
      },
    },
    cohere: {
      name: 'cohere',
      model: () => getCohereModel(),
      isConfigured: () => Boolean(process.env.COHERE_API_KEY),
      supportsInput: (input) => !input.contextFile || input.contextFile.mimeType === 'text/plain',
      call: async (input) => callCohere(input),
    },
    openrouter: {
      name: 'openrouter',
      model: () => getOpenRouterModel(),
      isConfigured: () => Boolean(process.env.OPENROUTER_API_KEY),
      supportsInput: (input) => !input.contextFile || input.contextFile.mimeType === 'text/plain',
      call: async (input) => callOpenRouter(input),
    },
  };

  return getProviderOrder().map((name) => providerMap[name]);
}

function shouldFallback(error: unknown): boolean {
  return (
    error instanceof AIContractError ||
    error instanceof RateLimitError ||
    error instanceof UpstreamServiceError ||
    error instanceof ConfigurationError
  );
}

export async function callGemini(input: GeminiInput, requestId: string): Promise<AIProviderCallResult> {
  if (isCircuitOpen()) {
    throw new UpstreamServiceError(
      'The AI service is temporarily overloaded. Please try again in 30 seconds.',
      503,
      'AI_PROVIDER_CIRCUIT_OPEN',
    );
  }

  const providers = createProviders().filter((provider) => {
    if (!provider.isConfigured()) {
      return false;
    }

    if (isProviderOnCooldown(provider.name)) {
      console.warn(
        `[ai:${requestId}] skipping provider=${provider.name} because it is cooling down after recent failures`,
      );
      return false;
    }

    if (!provider.supportsInput(input)) {
      console.warn(
        `[ai:${requestId}] skipping provider=${provider.name} because the current input uses an unsupported attachment type`,
      );
      return false;
    }

    return true;
  });

  if (providers.length === 0) {
    throw new ConfigurationError(
      'No AI provider is configured for the current request.',
      'NO_AI_PROVIDER_CONFIGURED',
    );
  }

  console.log(
    `[ai:${requestId}] gen start temp=${input.temperature} ctx=${!!input.contextFile} providers=${providers.map((provider) => provider.name).join('>')} circuit=${failureCount}/${CIRCUIT_THRESHOLD}`,
  );

  try {
    const result = await limit(async () => {
      let lastError: unknown;
      const attemptedProviders: ProviderName[] = [];

      for (const provider of providers) {
        try {
          attemptedProviders.push(provider.name);
          console.log(`[ai:${requestId}] trying provider=${provider.name}`);
          const startedAt = Date.now();
          const raw = await retryWithBackoff(
            () => provider.call(input, requestId),
            provider.name === 'gemini' ? 2 : 0,
            800,
          );
          const validated = validateProviderResponse(raw);
          const latencyMs = Date.now() - startedAt;
          markProviderSuccess(provider.name, latencyMs);
          console.log(
            `[ai:${requestId}] provider=${provider.name} succeeded len=${validated.length} latency=${latencyMs}ms`,
          );
          return {
            text: validated,
            provider: {
              name: provider.name,
              model: provider.model(),
              latencyMs,
              fallbackUsed: attemptedProviders.length > 1,
              attemptedProviders: [...attemptedProviders],
            },
          };
        } catch (err: unknown) {
          lastError = err;
          markProviderFailure(provider.name, err);
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[ai:${requestId}] provider=${provider.name} failed: ${message}`);

          if (!shouldFallback(err) || provider === providers[providers.length - 1]) {
            throw err;
          }

          console.warn(
            `[ai:${requestId}] provider=${provider.name} did not yield a usable answer, falling back to the next provider`,
          );
        }
      }

      throw lastError instanceof Error
        ? lastError
        : new UpstreamServiceError('All configured AI providers failed.', 503, 'ALL_AI_PROVIDERS_FAILED');
    });

    failureCount = 0;
    console.log(
      `[ai:${requestId}] gen done provider=${result.provider.name} len=${result.text.length}`,
    );
    return result;
  } catch (err: unknown) {
    failureCount++;
    lastFailureTime = Date.now();
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[ai:${requestId}] failed circuit=${failureCount}/${CIRCUIT_THRESHOLD} ${message}`,
    );
    throw err;
  }
}
