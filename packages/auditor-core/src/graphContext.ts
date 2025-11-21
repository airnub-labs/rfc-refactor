/**
 * Graph context module - manages RFC/OWASP spec discovery and Memgraph operations
 */

import type {
  DiscoveryContext,
  EnrichedSpec,
  GraphContext,
  SanitizedHttpExchange,
} from './types.js';
import { callPerplexityMcp, callMemgraphMcp } from './mcpClient.js';

/**
 * Discover relevant specs from HTTP exchanges using Perplexity MCP
 */
async function discoverRelevantSpecs(
  exchanges: SanitizedHttpExchange[],
  userQuestion?: string
): Promise<EnrichedSpec[]> {
  // Build context from sanitized exchanges
  const exchangeSummary = exchanges.map(ex => {
    return `${ex.request.method} ${ex.request.urlTemplate} -> ${ex.response.statusCode} ${ex.response.statusMessage}
    Response preview: ${ex.response.bodyPreview}`;
  }).join('\n\n');

  const query = `Given these HTTP API exchanges:

${exchangeSummary}

${userQuestion ? `User question: ${userQuestion}` : ''}

Identify relevant:
1. HTTP RFCs (RFC 7230-7235, RFC 9110-9114, etc.) for protocol compliance
2. OWASP Top 10:2021 categories for security issues
3. Any other relevant security or API standards

Return a structured list of spec IDs and their relevance to the observed issues.`;

  const perplexityResult = await callPerplexityMcp(query);

  // Parse the result to extract spec information
  const specs = parseSpecsFromPerplexityResult(perplexityResult);

  return specs;
}

/**
 * Parse Perplexity result to extract specs
 */
function parseSpecsFromPerplexityResult(result: string): EnrichedSpec[] {
  const specs: EnrichedSpec[] = [];

  // Extract RFC mentions
  const rfcMatches = result.matchAll(/RFC\s*(\d+)/gi);
  const rfcSet = new Set<string>();
  for (const match of rfcMatches) {
    rfcSet.add(match[1]);
  }

  for (const rfcNum of rfcSet) {
    specs.push({
      type: 'rfc',
      id: `RFC${rfcNum}`,
      title: `RFC ${rfcNum}`,
      sections: [],
    });
  }

  // Extract OWASP Top 10 mentions
  const owaspCategories = [
    { pattern: /A01.*Broken Access Control/gi, id: 'A01:2021', title: 'Broken Access Control' },
    { pattern: /A02.*Cryptographic Failures/gi, id: 'A02:2021', title: 'Cryptographic Failures' },
    { pattern: /A03.*Injection/gi, id: 'A03:2021', title: 'Injection' },
    { pattern: /A04.*Insecure Design/gi, id: 'A04:2021', title: 'Insecure Design' },
    { pattern: /A05.*Security Misconfiguration/gi, id: 'A05:2021', title: 'Security Misconfiguration' },
    { pattern: /A06.*Vulnerable.*Components/gi, id: 'A06:2021', title: 'Vulnerable and Outdated Components' },
    { pattern: /A07.*Authentication/gi, id: 'A07:2021', title: 'Identification and Authentication Failures' },
    { pattern: /A08.*Software.*Data Integrity/gi, id: 'A08:2021', title: 'Software and Data Integrity Failures' },
    { pattern: /A09.*Security Logging/gi, id: 'A09:2021', title: 'Security Logging and Monitoring Failures' },
    { pattern: /A10.*Server-Side Request Forgery/gi, id: 'A10:2021', title: 'Server-Side Request Forgery' },
  ];

  for (const category of owaspCategories) {
    if (category.pattern.test(result)) {
      specs.push({
        type: 'owasp',
        id: category.id,
        title: category.title,
        version: '2021',
      });
    }
  }

  // Also check for generic mentions
  if (/injection/gi.test(result) && !specs.find(s => s.id === 'A03:2021')) {
    specs.push({ type: 'owasp', id: 'A03:2021', title: 'Injection', version: '2021' });
  }
  if (/cors|cross-origin/gi.test(result) && !specs.find(s => s.id === 'A05:2021')) {
    specs.push({ type: 'owasp', id: 'A05:2021', title: 'Security Misconfiguration', version: '2021' });
  }
  if (/pii|sensitive data|data exposure/gi.test(result) && !specs.find(s => s.id === 'A02:2021')) {
    specs.push({ type: 'owasp', id: 'A02:2021', title: 'Cryptographic Failures', version: '2021' });
  }

  return specs;
}

/**
 * Upsert specs into Memgraph
 */
async function upsertSpecsToMemgraph(specs: EnrichedSpec[]): Promise<void> {
  for (const spec of specs) {
    if (spec.type === 'rfc') {
      const query = `
        MERGE (r:RFC {id: '${spec.id}'})
        SET r.title = '${spec.title.replace(/'/g, "\\'")}'
        RETURN r
      `;
      await callMemgraphMcp(query);
    } else if (spec.type === 'owasp') {
      const query = `
        MERGE (o:OWASP {id: '${spec.id}'})
        SET o.title = '${spec.title.replace(/'/g, "\\'")}',
            o.version = '${spec.version || '2021'}'
        RETURN o
      `;
      await callMemgraphMcp(query);
    }
  }

  // Create relationships between related specs
  for (const spec of specs) {
    if (spec.relationships) {
      for (const rel of spec.relationships) {
        const query = `
          MATCH (a {id: '${spec.id}'}), (b {id: '${rel.targetId}'})
          MERGE (a)-[:${rel.type}]->(b)
        `;
        await callMemgraphMcp(query);
      }
    }
  }
}

/**
 * Discover and upsert specs based on discovery context
 */
export async function discoverAndUpsertSpecs(
  context: DiscoveryContext
): Promise<EnrichedSpec[]> {
  // Discover relevant specs using Perplexity MCP
  const specs = await discoverRelevantSpecs(
    context.sanitizedExchanges,
    context.userQuestion
  );

  // Upsert to Memgraph
  await upsertSpecsToMemgraph(specs);

  return specs;
}

/**
 * Fetch graph context from Memgraph for findings
 */
export async function fetchGraphContextForFindings(
  specs: EnrichedSpec[]
): Promise<GraphContext> {
  const nodes: GraphContext['nodes'] = [];
  const edges: GraphContext['edges'] = [];

  // Query for each spec and its relationships
  const specIds = specs.map(s => `'${s.id}'`).join(', ');

  if (specIds) {
    // Get all spec nodes
    const nodeQuery = `
      MATCH (n)
      WHERE n.id IN [${specIds}]
      RETURN n.id as id, labels(n)[0] as type, properties(n) as props
    `;

    try {
      const nodeResult = await callMemgraphMcp(nodeQuery) as Array<{
        id: string;
        type: string;
        props: Record<string, string>;
      }>;

      if (Array.isArray(nodeResult)) {
        for (const row of nodeResult) {
          nodes.push({
            id: row.id,
            type: row.type.toLowerCase() as 'rfc' | 'owasp' | 'section' | 'concept',
            properties: row.props,
          });
        }
      }
    } catch {
      // Graph may be empty initially
    }

    // Get relationships
    const edgeQuery = `
      MATCH (a)-[r]->(b)
      WHERE a.id IN [${specIds}] OR b.id IN [${specIds}]
      RETURN a.id as source, b.id as target, type(r) as relType
    `;

    try {
      const edgeResult = await callMemgraphMcp(edgeQuery) as Array<{
        source: string;
        target: string;
        relType: string;
      }>;

      if (Array.isArray(edgeResult)) {
        for (const row of edgeResult) {
          edges.push({
            source: row.source,
            target: row.target,
            type: row.relType,
          });
        }
      }
    } catch {
      // Graph may be empty initially
    }
  }

  return { nodes, edges };
}
