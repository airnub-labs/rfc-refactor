# Sample API

This package contains an Express.js implementation of the sample API used for security auditing.

## Note on Current Usage

The sample API code in this package represents the **reference implementation** of the vulnerable endpoints. However, for the E2B sandbox execution, an equivalent inline implementation is used in `@e2b-auditor/core` (specifically in `e2bClient.ts`).

This is because:
1. The E2B sandbox needs the server code bundled inline for isolated execution
2. The sandbox runs a raw Node HTTP server for minimal dependencies

## Endpoints

The API exposes 5 endpoints with intentional vulnerabilities for testing:

- `GET /health-perfect` - Fully compliant, secure endpoint
- `GET /user-leaky` - Returns excessive PII (emails, SSN, credit cards)
- `GET /debug-error` - Exposes stack traces and internal config
- `POST /items-injection` - Vulnerable to SQL/command/template injection
- `GET /cors-wildcard` - Misconfigured CORS headers

## Running Locally

```bash
pnpm install
pnpm build
pnpm start
```

The server runs on port 3001 by default (configurable via `PORT` env var).

## Future Improvements

To align the codebase, consider:
- Bundling this package for E2B sandbox use
- Or removing this package if inline code is preferred
