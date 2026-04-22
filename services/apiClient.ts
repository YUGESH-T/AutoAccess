import type { ApiErrorPayload } from '../types';

export interface ApiClientOptions extends RequestInit {
  timeoutMs?: number;
}

export class ApiClientError extends Error {
  status?: number;
  code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

function getFriendlyErrorMessage(status: number, fallback?: string): string {
  if (fallback) {
    return fallback;
  }

  switch (status) {
    case 400:
      return 'The request was invalid. Please review your input and try again.';
    case 405:
      return 'This action is not supported.';
    case 413:
      return 'The uploaded file is too large.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    case 502:
    case 503:
      return 'The AI service is temporarily unavailable. Please try again shortly.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

function isApiErrorPayload(value: unknown): value is { error: ApiErrorPayload } {
  return (
    !!value &&
    typeof value === 'object' &&
    'error' in value &&
    !!(value as { error?: unknown }).error &&
    typeof (value as { error: ApiErrorPayload }).error.message === 'string'
  );
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function fetchWithErrorHandling<T>(
  input: RequestInfo | URL,
  options: ApiClientOptions = {},
): Promise<T> {
  const { timeoutMs = 55_000, signal, ...init } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });

    const text = await response.text();
    const maybeJson = text ? safeParseJson(text) : null;

    if (!response.ok) {
      const payload = isApiErrorPayload(maybeJson) ? maybeJson.error : undefined;
      const message = getFriendlyErrorMessage(response.status, payload?.message);
      throw new ApiClientError(message, response.status, payload?.code);
    }

    return maybeJson as T;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiClientError('The request timed out. Please try again.');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
