/**
 * Egress Guard - PII and sensitive data sanitization for outbound data
 *
 * This module is the ONLY place where PII sanitization should happen for egress.
 * All data leaving the system (to LLMs, MCP tools, etc.) must pass through here.
 *
 * ## Two-Layer Sanitization Approach
 *
 * We use two complementary methods to ensure thorough sanitization:
 *
 * ### Layer 1: @redactpii/node (ML-based)
 * - Uses machine learning to detect PII patterns
 * - Good at catching context-dependent PII (names, addresses)
 * - May miss some technical secrets (API keys, JWTs)
 *
 * ### Layer 2: Regex patterns (rule-based)
 * - Catches specific technical patterns (API keys, JWTs, etc.)
 * - More predictable and testable
 * - Complements ML detection for comprehensive coverage
 *
 * ## Usage
 *
 * ```typescript
 * // Sanitize a string
 * const safe = sanitizeTextForEgress(userInput);
 *
 * // Sanitize an object recursively
 * const safeObj = sanitizeObjectForEgress(userData);
 *
 * // Check if a header is sensitive
 * if (isSensitiveHeader('Authorization')) {
 *   // Don't include this header
 * }
 * ```
 *
 * ## Adding New Patterns
 *
 * To add a new sensitive pattern, add it to SENSITIVE_PATTERNS array:
 * ```typescript
 * { pattern: /your-regex/g, replacement: '[LABEL]' }
 * ```
 */

import { Redactor } from '@redactpii/node';

// Create a redactor instance for PII detection
const redactor = new Redactor();
const redactPii = (text: string): string => redactor.redact(text);

/**
 * Regex patterns for detecting sensitive data
 *
 * These patterns catch technical secrets that ML-based detection might miss.
 * Each pattern has a descriptive replacement to indicate what was redacted.
 */
const SENSITIVE_PATTERNS = [
  // Email addresses
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL]' },
  // Phone numbers
  { pattern: /(\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, replacement: '[PHONE]' },
  // SSN
  { pattern: /\d{3}-\d{2}-\d{4}/g, replacement: '[SSN]' },
  // Credit card numbers
  { pattern: /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g, replacement: '[CREDIT_CARD]' },
  // API keys (common patterns)
  { pattern: /sk_live_[a-zA-Z0-9]+/g, replacement: '[API_KEY]' },
  { pattern: /sk_test_[a-zA-Z0-9]+/g, replacement: '[API_KEY]' },
  { pattern: /api[_-]?key['":\s]*[a-zA-Z0-9_-]{20,}/gi, replacement: '[API_KEY]' },
  // JWT tokens
  { pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, replacement: '[JWT]' },
  // IP addresses
  { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '[IP_ADDRESS]' },
  // Passwords in common contexts
  { pattern: /password['":\s]*[^\s,}"']+/gi, replacement: 'password: [REDACTED]' },
];

/**
 * Sanitize text for egress - removes PII and sensitive data
 */
export function sanitizeTextForEgress(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let sanitized = text;

  // Apply @redactpii/node first if available
  try {
    sanitized = redactPii(sanitized);
  } catch {
    // Continue with pattern-based redaction
  }

  // Apply additional pattern-based redaction
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  return sanitized;
}

/**
 * Sanitize an object by recursively sanitizing all string values
 */
export function sanitizeObjectForEgress<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeTextForEgress(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObjectForEgress(item)) as T;
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeObjectForEgress(value);
    }
    return result as T;
  }

  return obj;
}

/**
 * List of sensitive headers that should be completely removed or masked
 */
export const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
  'x-csrf-token',
  'x-xsrf-token',
  'proxy-authorization',
  'www-authenticate',
];

/**
 * Check if a header name is sensitive
 */
export function isSensitiveHeader(headerName: string): boolean {
  return SENSITIVE_HEADERS.includes(headerName.toLowerCase());
}
