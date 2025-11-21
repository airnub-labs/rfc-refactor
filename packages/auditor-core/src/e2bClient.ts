/**
 * E2B sandbox client for creating and managing sandboxes
 */

import { Sandbox } from '@e2b/code-interpreter';

export interface SandboxHandle {
  sandbox: Sandbox;
  id: string;
}

/**
 * Create a new E2B sandbox
 */
export async function createSandbox(): Promise<SandboxHandle> {
  const sandbox = await Sandbox.create({
    timeoutMs: 300000, // 5 minutes
  });

  return {
    sandbox,
    id: sandbox.sandboxId,
  };
}

/**
 * Run sample API server inside the sandbox
 */
export async function runSampleApiInSandbox(handle: SandboxHandle): Promise<void> {
  const { sandbox } = handle;

  // Install dependencies and start the sample API
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
