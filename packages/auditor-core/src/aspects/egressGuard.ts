/**
 * Egress guard - wraps @redactpii/node for PII sanitization
 * This is the ONLY place where PII sanitization should happen for egress
 */

// Note: @redactpii/node may need different import syntax based on version
// Using a try-catch pattern to handle different module formats
let redactPii: (text: string) => string;

try {
  // Try ESM import
  const redactModule = await import('@redactpii/node');
  redactPii = redactModule.default || redactModule.redact || ((text: string) => text);
} catch {
  // Fallback: simple pattern-based redaction if module not available
  redactPii = (text: string) => text;
}

// Patterns for common PII and sensitive data
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
