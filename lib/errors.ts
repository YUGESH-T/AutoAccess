/**
 * Structured API error — thrown by handlers, caught by route wrappers.
 * `status` maps directly to the HTTP response code sent to the client.
 */
export class APIError extends Error {
  public readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'APIError';
    this.status = status;
  }
}
