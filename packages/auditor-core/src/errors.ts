/**
 * Custom error classes for the auditor
 *
 * This module provides a hierarchy of typed errors that make it easier
 * to handle different failure scenarios consistently across the codebase.
 *
 * Usage:
 * ```typescript
 * throw new SandboxError('Failed to create sandbox', { cause: originalError });
 * ```
 *
 * Catching specific errors:
 * ```typescript
 * try {
 *   await runAudit();
 * } catch (error) {
 *   if (error instanceof McpError) {
 *     // Handle MCP-specific failures
 *   } else if (error instanceof SandboxError) {
 *     // Handle sandbox failures
 *   }
 * }
 * ```
 */

/**
 * Base error class for all auditor errors
 */
export class AuditorError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AuditorError';
  }
}

/**
 * Error thrown when E2B sandbox operations fail
 */
export class SandboxError extends AuditorError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SandboxError';
  }
}

/**
 * Error thrown when MCP gateway calls fail
 */
export class McpError extends AuditorError {
  /** The MCP tool that failed */
  public readonly toolName?: string;

  constructor(message: string, toolName?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'McpError';
    this.toolName = toolName;
  }
}

/**
 * Error thrown when Groq LLM calls fail
 */
export class LlmError extends AuditorError {
  /** HTTP status code if available */
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LlmError';
    this.statusCode = statusCode;
  }
}

/**
 * Error thrown when HTTP probing fails
 */
export class ProbeError extends AuditorError {
  /** The endpoint that failed */
  public readonly endpoint?: string;

  constructor(message: string, endpoint?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProbeError';
    this.endpoint = endpoint;
  }
}

/**
 * Error thrown when sanitization fails
 */
export class SanitizationError extends AuditorError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SanitizationError';
  }
}

/**
 * Error thrown when graph operations fail
 */
export class GraphError extends AuditorError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GraphError';
  }
}

/**
 * Type guard to check if an error is an AuditorError
 */
export function isAuditorError(error: unknown): error is AuditorError {
  return error instanceof AuditorError;
}

/**
 * Extract a user-friendly error message from any error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
