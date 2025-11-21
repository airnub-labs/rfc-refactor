# AGENTS.md – Coding & Runtime Agents for the E2B RFC/OWASP Auditor

This document describes the **agents** (both human‑facing and internal) that participate in building and running the system, and how they should use the architecture and decisions.

The goal is to make it easy to plug this into AI coding agents (GitHub Copilot, OpenAI Code Interpreter, local LLMs, etc.) and keep them aligned.

---

## 1. Roles & Responsibilities

### 1.1. UI Agent (Next.js / shadcn)

**Scope**: `apps/web`

**Primary responsibilities**:

- Implement a **chat‑centric UI** with:
  - Message list (user + assistant messages).
  - Input box + send button.
  - "Run audit" button that **injects a chat message** rather than calling a separate API.
- Call only a single backend route: **`POST /api/chat`**.
- Render structured audit results (if present) below the chat:
  - Table of endpoints → issues → RFC/OWASP references.
  - Optional mini graph visualization from the spec graph context.

**Key constraints (from DECISIONS.md)**:

- Do not introduce multiple flows (no `/api/audit` route or separate screens).
- Keep the UI simple and focused; this is a hackathon project, not a full SaaS.

**Key inputs**:

- `ComplianceReport` JSON from `/api/chat` responses.
- Chat messages.

**Key outputs**:

- Clean, readable, dark‑mode‑friendly UI.
- Clear affordance for "Run audit on sample API".

---

### 1.2. Chat Orchestrator Agent (API route)

**Scope**: `apps/web/app/api/chat/route.ts` (or similar, depending on Next.js version).

**Primary responsibilities**:

- Accept `POST /api/chat` requests with full chat history.
- Inspect the **latest user message** to determine intent:
  - If it contains a special token / pattern (e.g. `__RUN_SAMPLE_AUDIT__` or a known textual phrase), call `runAuditOnSampleApi()` from `auditor-core`.
  - Otherwise, treat as a general question and call `groqChat()`.
- Translate `ComplianceReport` into:
  - An assistant message summarising findings.
  - Optional `report` field in the JSON payload for UI rendering.

**Key constraints**:

- **Do not** expose raw MCP or sandbox internals directly to the client.
- **Do not** create additional API routes for audit/refactor; all must go through `/api/chat`.

**Key inputs**:

- Chat message history.
- `runAuditOnSampleApi` and `groqChat` functions from `auditor-core`.

**Key outputs**:

- Consistent chat responses.
- Optional structured payload for UI.

---

### 1.3. Auditor Core Agent

**Scope**: `packages/auditor-core`

**Primary responsibilities**:

- Provide **pure TypeScript functions** to:
  - Create and manage an E2B sandbox.
  - Run the `sample-api` server in the sandbox.
  - Probe HTTP endpoints and collect `RawHttpExchange[]`.
  - Sanitize exchanges into `SanitizedHttpExchange[]` using `@redactpii/node`.
  - Discover relevant RFCs/OWASP via Perplexity MCP.
  - Upsert discovered specs into Memgraph via Memgraph MCP.
  - Fetch graph context from Memgraph.
  - Call Groq with sanitized data + spec + graph context and produce `ComplianceReport`.

**Key functions** (shape, not exact signatures):

```ts
// E2B
async function createSandbox(): Promise<SandboxHandle> {}
async function runSampleApiInSandbox(sandbox: SandboxHandle): Promise<void> {}

// Probing
async function probeSampleApi(sandbox: SandboxHandle): Promise<RawHttpExchange[]> {}

// Sanitization
function sanitizeExchanges(raw: RawHttpExchange[]): SanitizedHttpExchange[] {}

// MCP
async function discoverAndUpsertSpecs(ctx: DiscoveryContext): Promise<EnrichedSpec[]> {}
async function fetchGraphContextForFindings(specs: EnrichedSpec[]): Promise<GraphContext> {}

// LLM
async function analyzeComplianceWithGroq(input: {
  probes: SanitizedHttpExchange[];
  specs: EnrichedSpec[];
  graphContext: GraphContext;
}): Promise<ComplianceReport> {}

// High-level orchestration
export async function runAuditOnSampleApi(): Promise<ComplianceReport> {}
```

**Key constraints**:

- All network calls to external services must go through:
  - `mcpCall` (MCP Gateway) or
  - `groqChat` (Groq client), both wrapped in aspects.
- Never leak `RawHttpExchange` outside the sandbox; convert to sanitized forms first.

---

### 1.4. Aspect & Egress Guard Agent

**Scope**: `packages/auditor-core/aspects/*`

**Primary responsibilities**:

- Implement the generic **aspect/middleware** helper:
  - `applyAspects<Req, Res>(base, aspects[])`.
- Implement aspects for:
  - MCP client:
    - `mcpSanitizationAspect` – run `@redactpii/node` on outbound content.
    - `mcpLoggingAspect` – log tool names safely (optional).
  - Groq client:
    - `llmSystemPromptAspect` – inject a base system message.
    - `llmSanitizationAspect` – sanitize outbound LLM content.
- Implement `egressGuard.ts` that wraps `@redactpii/node` and provides helpers:
  - `sanitizeTextForEgress(text: string): string`.

**Key constraints**:

- No third‑party AOP libraries (kaop-ts, AspectJS, etc.).
- The aspect layer is the **only place** where outbound payloads are altered for safety.

---

### 1.5. MCP / Graph Agent

**Scope**: `packages/auditor-core/mcpClient.ts`, `graphContext.ts`

**Primary responsibilities**:

- `mcpClient.ts`:
  - Implement a basic MCP client that
    - Sends requests to the **MCP Gateway** endpoint inside the sandbox.
    - Uses aspects for sanitization/logging.
  - Expose a simple `mcpCall({ toolName, params })` function.

- `graphContext.ts`:
  - Implement `discoverAndUpsertSpecs`:
    - Use `mcpCall` with Perplexity MCP to:
      - Identify relevant RFCs and OWASP entries.
      - Fetch key details (titles, sections, relationships) as needed.
    - Use `mcpCall` with Memgraph MCP to upsert this data into Memgraph via Cypher.
  - Implement `fetchGraphContextForFindings`:
    - Use Memgraph MCP to retrieve a subgraph of RFCs/OWASP/Concept nodes relevant to the current audit.

**Key constraints**:

- Start with **empty Memgraph** (or near empty).
- Do not hardcode large RFC/OWASP sets into the DB.
- Always treat Perplexity MCP as the source of freshness when discovering specs.

---

### 1.6. Sample API Agent

**Scope**: `packages/sample-api`

**Primary responsibilities**:

- Implement a simple Express server with endpoints designed to:
  - Demonstrate common HTTP and security issues.
  - Provide at least one fully compliant endpoint (`/health-perfect`).

**Key constraints**:

- This service is **never** exposed directly to the Internet; only the E2B sandbox uses it.
- Code should be clear and compact; this is an educational fixture.

---

## 2. Agent Collaboration Patterns

### 2.1. During development (coding agents)

When using AI coding agents (e.g. OpenAI, GitHub Copilot, etc.), follow this pattern:

1. **Start from DECISIONS.md** and **ARCHITECTURE.md**.
   - Agents must not introduce features explicitly listed as out of scope.
2. Implement modules in this order:
   1. `packages/sample-api` (simple Express API).
   2. `packages/auditor-core/aspects` (applyAspects, egressGuard, mcp/groq wrappers).
   3. `packages/auditor-core/e2bClient.ts` and `probeHttp.ts`.
   4. `packages/auditor-core/sanitizeHttp.ts`.
   5. `packages/auditor-core/mcpClient.ts` and `graphContext.ts`.
   6. `packages/auditor-core/auditEngine.ts`.
   7. `apps/web` UI and `/api/chat` handler.
3. Ensure all network calls conform to the **egress guard** constraints.

### 2.2. At runtime (user journey)

1. User interacts with the **chat UI**.
2. Chat orchestrator decides whether to run an audit or just answer a question.
3. Auditor core runs inside an **E2B sandbox**, producing:
   - HTTP probes → sanitized exchanges.
   - Spec discovery via MCP.
   - Spec graph updates in Memgraph.
   - Compliance reports via Groq.
4. UI agent presents structured and conversational results to the user.

---

## 3. Guardrails for Coding Agents

To keep the project aligned with the hackathon goals, coding agents must:

- **Follow DECISIONS.md as a contract.**
- **Not** add new external dependencies without explicit justification (especially AOP, HAR, GraphRAG frameworks).
- **Respect the sandbox/egress boundary**.
- Use Memgraph only via **Memgraph MCP**; the app code should not talk directly to Memgraph over Bolt.
- Use Perplexity only as an **MCP tool**; do not hardcode arbitrary HTTP calls to Perplexity's API.
- Keep all user‑facing flows in the **single chat interface**.

Deviations from these rules should be treated as potential scope creep and require conscious human approval.

