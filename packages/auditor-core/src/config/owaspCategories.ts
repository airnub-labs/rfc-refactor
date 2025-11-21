/**
 * OWASP Top 10:2021 category definitions
 *
 * This configuration file defines all OWASP Top 10:2021 categories
 * with their IDs, titles, and detection patterns.
 *
 * @see https://owasp.org/Top10/
 */

export interface OwaspCategory {
  /** OWASP category ID (e.g., 'A01:2021') */
  id: string;
  /** Human-readable title */
  title: string;
  /** Regex pattern to detect mentions in text */
  pattern: RegExp;
  /** Alternative keywords that indicate this category */
  keywords: string[];
}

/**
 * All OWASP Top 10:2021 categories
 */
export const OWASP_CATEGORIES: OwaspCategory[] = [
  {
    id: 'A01:2021',
    title: 'Broken Access Control',
    pattern: /A01.*Broken Access Control/gi,
    keywords: ['access control', 'authorization', 'privilege escalation'],
  },
  {
    id: 'A02:2021',
    title: 'Cryptographic Failures',
    pattern: /A02.*Cryptographic Failures/gi,
    keywords: ['cryptographic', 'encryption', 'sensitive data', 'pii', 'data exposure'],
  },
  {
    id: 'A03:2021',
    title: 'Injection',
    pattern: /A03.*Injection/gi,
    keywords: ['injection', 'sql injection', 'xss', 'command injection'],
  },
  {
    id: 'A04:2021',
    title: 'Insecure Design',
    pattern: /A04.*Insecure Design/gi,
    keywords: ['insecure design', 'threat modeling', 'secure design'],
  },
  {
    id: 'A05:2021',
    title: 'Security Misconfiguration',
    pattern: /A05.*Security Misconfiguration/gi,
    keywords: ['misconfiguration', 'cors', 'cross-origin', 'default credentials'],
  },
  {
    id: 'A06:2021',
    title: 'Vulnerable and Outdated Components',
    pattern: /A06.*Vulnerable.*Components/gi,
    keywords: ['vulnerable components', 'outdated', 'dependencies'],
  },
  {
    id: 'A07:2021',
    title: 'Identification and Authentication Failures',
    pattern: /A07.*Authentication/gi,
    keywords: ['authentication', 'session', 'credential', 'identity'],
  },
  {
    id: 'A08:2021',
    title: 'Software and Data Integrity Failures',
    pattern: /A08.*Software.*Data Integrity/gi,
    keywords: ['integrity', 'deserialization', 'ci/cd'],
  },
  {
    id: 'A09:2021',
    title: 'Security Logging and Monitoring Failures',
    pattern: /A09.*Security Logging/gi,
    keywords: ['logging', 'monitoring', 'audit trail'],
  },
  {
    id: 'A10:2021',
    title: 'Server-Side Request Forgery',
    pattern: /A10.*Server-Side Request Forgery/gi,
    keywords: ['ssrf', 'server-side request forgery'],
  },
];

/**
 * Find OWASP category by ID
 */
export function findOwaspCategoryById(id: string): OwaspCategory | undefined {
  return OWASP_CATEGORIES.find(cat => cat.id === id);
}

/**
 * Find OWASP categories by keyword match
 */
export function findOwaspCategoriesByKeyword(text: string): OwaspCategory[] {
  const lowerText = text.toLowerCase();
  return OWASP_CATEGORIES.filter(cat =>
    cat.keywords.some(keyword => lowerText.includes(keyword))
  );
}

/**
 * Check if text matches any OWASP category pattern
 */
export function matchOwaspCategories(text: string): OwaspCategory[] {
  return OWASP_CATEGORIES.filter(cat => cat.pattern.test(text));
}
