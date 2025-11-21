/**
 * Main entry point for @e2b-auditor/core
 */

// Types
export * from './types.js';

// Aspects
export { applyAspects, type Aspect } from './aspects/applyAspects.js';
export {
  sanitizeTextForEgress,
  sanitizeObjectForEgress,
  isSensitiveHeader,
  SENSITIVE_HEADERS,
} from './aspects/egressGuard.js';

// E2B Client
export {
  createSandbox,
  runSampleApiInSandbox,
  runInSandbox,
  closeSandbox,
  type SandboxHandle,
} from './e2bClient.js';

// HTTP Probing
export { probeSampleApi, probeSingleEndpoint } from './probeHttp.js';

// Sanitization
export { sanitizeHttpExchange, sanitizeHttpExchanges } from './sanitizeHttp.js';

// MCP Client
export {
  mcpCall,
  callPerplexityMcp,
  callMemgraphMcp,
  getMemgraphSchema,
  configureMcpGateway,
  getMcpGatewayUrl,
} from './mcpClient.js';

// Graph Context
export {
  discoverAndUpsertSpecs,
  fetchGraphContextForFindings,
} from './graphContext.js';

// Groq Client
export { groqChat, analyzeComplianceWithGroq } from './groqClient.js';

// Audit Engine
export { runAuditOnSampleApi, reportToSummary } from './auditEngine.js';
