/**
 * MCP Client - communicates with MCP Gateway for Perplexity and Memgraph tools
 * Supports both E2B built-in gateway and external Docker gateway
 */

import type { MCPCallParams, MCPCallResponse } from './types.js';
import { applyAspects, type Aspect } from './aspects/applyAspects.js';
import { sanitizeObjectForEgress } from './aspects/egressGuard.js';

// MCP Gateway configuration - can be overridden by sandbox handle
let mcpGatewayUrl = process.env.MCP_GATEWAY_URL || 'http://localhost:8080';
let mcpGatewayToken = '';

/**
 * Configure MCP client with gateway credentials from E2B sandbox
 */
export function configureMcpGateway(url: string, token: string): void {
  mcpGatewayUrl = url;
  mcpGatewayToken = token;
}

/**
 * Get current MCP gateway URL
 */
export function getMcpGatewayUrl(): string {
  return mcpGatewayUrl;
}

/**
 * Base MCP call function
 */
async function baseMcpCall(params: MCPCallParams): Promise<MCPCallResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add bearer token if available (for E2B gateway)
  if (mcpGatewayToken) {
    headers['Authorization'] = `Bearer ${mcpGatewayToken}`;
  }

  const response = await fetch(`${mcpGatewayUrl}/tools/${params.toolName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params.params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      result: null,
      error: `MCP call failed: ${response.status} - ${errorText}`,
    };
  }

  const result = await response.json();
  return { result };
}

/**
 * MCP sanitization aspect - sanitizes outbound content
 */
const mcpSanitizationAspect: Aspect<MCPCallParams, MCPCallResponse> = async (req, next) => {
  // Sanitize params before sending
  const sanitizedParams: MCPCallParams = {
    toolName: req.toolName,
    params: sanitizeObjectForEgress(req.params),
  };

  return next(sanitizedParams);
};

/**
 * MCP logging aspect - logs tool calls without exposing payloads
 */
const mcpLoggingAspect: Aspect<MCPCallParams, MCPCallResponse> = async (req, next) => {
  const start = Date.now();

  try {
    const result = await next(req);
    const duration = Date.now() - start;
    console.log(`[MCP] ${req.toolName} completed in ${duration}ms`);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`[MCP] ${req.toolName} failed after ${duration}ms`);
    throw error;
  }
};

/**
 * Aspect-wrapped MCP call
 */
export const mcpCall = applyAspects(baseMcpCall, [
  mcpLoggingAspect,
  mcpSanitizationAspect,
]);

/**
 * Call Perplexity MCP for spec discovery
 * Uses perplexity_ask tool from official MCP server
 */
export async function callPerplexityMcp(query: string): Promise<string> {
  // Try E2B gateway perplexity tool first, then fallback to external
  const toolNames = [
    'perplexity.perplexity_ask',  // E2B gateway format
    'perplexity_mcp.search',       // External gateway format
  ];

  let lastError: string | undefined;

  for (const toolName of toolNames) {
    const response = await mcpCall({
      toolName,
      params: { query },
    });

    if (!response.error) {
      return response.result as string;
    }

    lastError = response.error;
  }

  throw new Error(lastError || 'Failed to call Perplexity MCP');
}

/**
 * Call Memgraph MCP to run a Cypher query
 */
export async function callMemgraphMcp(cypherQuery: string): Promise<unknown> {
  const response = await mcpCall({
    toolName: 'memgraph_mcp.run_query',
    params: { query: cypherQuery },
  });

  if (response.error) {
    throw new Error(response.error);
  }

  return response.result;
}

/**
 * Get Memgraph schema
 */
export async function getMemgraphSchema(): Promise<unknown> {
  const response = await mcpCall({
    toolName: 'memgraph_mcp.get_schema',
    params: {},
  });

  if (response.error) {
    throw new Error(response.error);
  }

  return response.result;
}
