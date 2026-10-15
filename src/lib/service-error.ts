/**
 * Business-rule failure with an HTTP status and a stable machine code, thrown by services (scan documents, barcodes)
 * and mapped to the JSON error envelope by lib/api-http.ts. Pure.
 */
export class DomainError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "DomainError";
  }
}
