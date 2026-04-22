export interface ApiErrorShape {
  message: string;
  code?: string;
}

export interface ApiErrorResponse {
  error: ApiErrorShape;
}

/**
 * Base structured API error.
 * All application-level failures should extend this class so they can be
 * serialized consistently across dev and production.
 */
export class APIError extends Error {
  public readonly status: number;
  public readonly code?: string;

  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
  }
}

export class ValidationError extends APIError {
  constructor(message: string, code = 'VALIDATION_ERROR') {
    super(message, 400, code);
    this.name = 'ValidationError';
  }
}

export class MethodNotAllowedError extends APIError {
  constructor(message = 'Method not allowed', code = 'METHOD_NOT_ALLOWED') {
    super(message, 405, code);
    this.name = 'MethodNotAllowedError';
  }
}

export class PayloadTooLargeError extends APIError {
  constructor(message: string, code = 'PAYLOAD_TOO_LARGE') {
    super(message, 413, code);
    this.name = 'PayloadTooLargeError';
  }
}

export class RateLimitError extends APIError {
  constructor(message: string, code = 'RATE_LIMITED') {
    super(message, 429, code);
    this.name = 'RateLimitError';
  }
}

export class ConfigurationError extends APIError {
  constructor(message: string, code = 'SERVER_MISCONFIGURED') {
    super(message, 500, code);
    this.name = 'ConfigurationError';
  }
}

export class UpstreamServiceError extends APIError {
  constructor(message: string, status = 502, code = 'UPSTREAM_ERROR') {
    super(message, status, code);
    this.name = 'UpstreamServiceError';
  }
}

export class AIContractError extends APIError {
  constructor(message: string, code = 'AI_CONTRACT_ERROR') {
    super(message, 502, code);
    this.name = 'AIContractError';
  }
}

export function isApiError(error: unknown): error is APIError {
  return error instanceof APIError;
}

export function toApiErrorResponse(error: unknown): {
  status: number;
  body: ApiErrorResponse;
} {
  if (isApiError(error)) {
    return {
      status: error.status,
      body: {
        error: {
          message: error.message,
          ...(error.code ? { code: error.code } : {}),
        },
      },
    };
  }

  const fallbackMessage =
    error instanceof Error ? error.message : 'An unexpected error occurred.';

  return {
    status: 500,
    body: {
      error: {
        message: fallbackMessage,
        code: 'INTERNAL_SERVER_ERROR',
      },
    },
  };
}
