/**
 * E2B sandbox client for creating and managing sandboxes
 * Uses E2B's built-in MCP gateway for tool access
 *
 * E2B MCP Architecture:
 * - E2B provides a batteries-included MCP gateway inside sandboxes
 * - Tools are configured during sandbox creation via the `mcp` option
 * - Gateway uses stdio transport internally, exposed via HTTP with bearer auth
 * - Use getMcpUrl()/getMcpToken() to get gateway credentials
 *
 * For Perplexity:
 * - Can use E2B's built-in support: `mcp: { perplexity: { apiKey } }`
 * - Or custom server from GitHub: `mcp: { 'github/repo': { runCmd, installCmd } }`
 *
 * For Memgraph:
 * - Runs as persistent Docker service (not inside sandbox)
 * - Accessed via external MCP gateway for knowledge graph persistence
 */

import { Sandbox } from '@e2b/code-interpreter';

export interface SandboxHandle {
  sandbox: Sandbox;
  id: string;
  mcpUrl: string;
  mcpToken: string;
}

// MCP configuration types following E2B patterns
interface BuiltInMCPConfig {
  perplexity?: {
    apiKey: string;
  };
}

interface CustomMCPServerConfig {
  runCmd: string;
  installCmd?: string;
}

type MCPConfig = BuiltInMCPConfig & {
  [key: string]: CustomMCPServerConfig | { apiKey: string } | undefined;
};

/**
 * Create a new E2B sandbox with MCP gateway configured
 *
 * @param options - Optional configuration overrides
 * @returns SandboxHandle with gateway credentials
 */
export async function createSandbox(options?: {
  timeoutMs?: number;
  useCustomPerplexity?: boolean;
}): Promise<SandboxHandle> {
  const mcpConfig: MCPConfig = {};

  // Configure Perplexity MCP
  if (process.env.PERPLEXITY_API_KEY) {
    if (options?.useCustomPerplexity) {
      // Use official Perplexity MCP server from modelcontextprotocol repo
      // Following E2B custom server pattern: https://e2b.dev/docs/mcp/custom-servers
      mcpConfig['ppl-ai/modelcontextprotocol'] = {
        installCmd: 'npm install',
        runCmd: 'npx -y @anthropic-ai/mcp-server-perplexity',
      };
    } else {
      // Use E2B's built-in Perplexity support
      mcpConfig.perplexity = {
        apiKey: process.env.PERPLEXITY_API_KEY,
      };
    }
  }

  // Create sandbox with MCP configuration
  const sandbox = await Sandbox.create({
    timeoutMs: options?.timeoutMs || 300000, // 5 minutes default
    // Pass environment variables to sandbox
    envs: {
      PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY || '',
    },
    // MCP gateway configuration
    ...(Object.keys(mcpConfig).length > 0 && { mcp: mcpConfig }),
  });

  // Get MCP gateway credentials
  // API may be getMcpUrl/getMcpToken or betaGetMcpUrl/betaGetMcpToken
  let mcpUrl = '';
  let mcpToken = '';

  try {
    // Try standard API first
    if (typeof (sandbox as any).getMcpUrl === 'function') {
      mcpUrl = (sandbox as any).getMcpUrl();
      mcpToken = await (sandbox as any).getMcpToken();
    } else if (typeof (sandbox as any).betaGetMcpUrl === 'function') {
      // Fall back to beta API
      mcpUrl = (sandbox as any).betaGetMcpUrl();
      mcpToken = await (sandbox as any).betaGetMcpToken();
    } else {
      // Fallback to external MCP gateway for local development
      console.log('[E2B] MCP gateway methods not available, using external gateway');
      mcpUrl = process.env.MCP_GATEWAY_URL || 'http://localhost:8080';
      mcpToken = '';
    }
  } catch (error) {
    // Fallback to external MCP gateway
    console.log('[E2B] Failed to get MCP gateway credentials, using external gateway:', error);
    mcpUrl = process.env.MCP_GATEWAY_URL || 'http://localhost:8080';
    mcpToken = '';
  }

  console.log(`[E2B] Sandbox created: ${sandbox.sandboxId}`);
  console.log(`[E2B] MCP Gateway URL: ${mcpUrl}`);
  console.log(`[E2B] MCP Token available: ${mcpToken ? 'yes' : 'no'}`);

  return {
    sandbox,
    id: sandbox.sandboxId,
    mcpUrl,
    mcpToken,
  };
}

/**
 * Run sample API server inside the sandbox
 */
export async function runSampleApiInSandbox(handle: SandboxHandle): Promise<void> {
  const { sandbox } = handle;

  // Sample API server code
  const sampleApiCode = `
const http = require('http');

const app = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost:3001');
  const pathname = url.pathname;
  const method = req.method;

  res.setHeader('Content-Type', 'application/json');

  // GET /health-perfect - Fully compliant endpoint
  if (method === 'GET' && pathname === '/health-perfect') {
    res.statusCode = 200;
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }));
    return;
  }

  // GET /user-leaky - Leaks PII
  if (method === 'GET' && pathname === '/user-leaky') {
    res.statusCode = 200;
    res.end(JSON.stringify({
      id: 12345,
      email: 'john.doe@example.com',
      name: 'John Doe',
      ssn: '123-45-6789',
      creditCardNumber: '4111-1111-1111-1111',
      password: 'hashed_but_still_exposed_p@ssw0rd123',
      internalUserId: 'usr_internal_abc123xyz',
      apiKey: 'sk_live_abcdef123456789',
      phoneNumber: '+1-555-123-4567'
    }));
    return;
  }

  // GET /debug-error - Exposes stack traces
  if (method === 'GET' && pathname === '/debug-error') {
    try {
      const obj = null;
      obj.nonExistentMethod();
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
        stack: error.stack,
        debugInfo: {
          nodeVersion: process.version,
          platform: process.platform,
          env: {
            DATABASE_URL: 'postgres://admin:secret@localhost:5432/mydb',
            SECRET_KEY: 'super_secret_key_12345'
          }
        }
      }));
    }
    return;
  }

  // POST /items-injection - Injection vulnerability
  if (method === 'POST' && pathname === '/items-injection') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const unsafeQuery = \`SELECT * FROM items WHERE name = '\${data.name}' AND \${data.query}\`;
        res.statusCode = 200;
        res.end(JSON.stringify({
          message: 'Item processed',
          generatedQuery: unsafeQuery,
          input: data
        }));
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // GET /cors-wildcard - CORS misconfiguration
  if (method === 'GET' && pathname === '/cors-wildcard') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', 'Authorization, X-Api-Key');
    res.statusCode = 200;
    res.end(JSON.stringify({
      data: 'Sensitive data with wildcard CORS',
      internalToken: 'tok_internal_xyz789'
    }));
    return;
  }

  // 404 for unknown routes
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
});

app.listen(3001, () => {
  console.log('Sample API running on port 3001');
});
`;

  await sandbox.runCode(sampleApiCode);

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));
}

/**
 * Run code inside the sandbox and return result
 */
export async function runInSandbox<T>(
  handle: SandboxHandle,
  code: string
): Promise<T> {
  const { sandbox } = handle;
  const result = await sandbox.runCode(code);

  if (result.error) {
    throw new Error(`Sandbox execution error: ${result.error.message}`);
  }

  // Parse the last result
  if (result.results && result.results.length > 0) {
    const lastResult = result.results[result.results.length - 1];
    if (lastResult.text) {
      try {
        return JSON.parse(lastResult.text) as T;
      } catch {
        return lastResult.text as T;
      }
    }
  }

  return undefined as T;
}

/**
 * Cleanup sandbox
 */
export async function closeSandbox(handle: SandboxHandle): Promise<void> {
  await handle.sandbox.kill();
}
