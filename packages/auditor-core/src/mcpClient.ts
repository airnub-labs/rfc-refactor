/**
 * MCP Client - communicates with MCP Gateway for Perplexity and Memgraph tools
 */

import type { MCPCallParams, MCPCallResponse } from './types.js';
import { applyAspects, type Aspect } from './aspects/applyAspects.js';
import { sanitizeObjectForEgress } from './aspects/egressGuard.js';

// MCP Gateway configuration
const MCP_GATEWAY_URL = process.env.MCP_GATEWAY_URL || 'http://localhost:8080';

/**
 * Base MCP call function
 */
async function baseMcpCall(params: MCPCallParams): Promise<MCPCallResponse> {
  const response = await fetch(`${MCP_GATEWAY_URL}/tools/${params.toolName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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
 */
export async function callPerplexityMcp(query: string): Promise<string> {
  const response = await mcpCall({
    toolName: 'perplexity_mcp.search',
    params: { query },
  });

  if (response.error) {
    throw new Error(response.error);
  }

  return response.result as string;
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
