/**
 * Audit engine - high-level orchestration for running audits
 */

import type { ComplianceReport, DiscoveryContext } from './types.js';
import { createSandbox, runSampleApiInSandbox, closeSandbox } from './e2bClient.js';
import { probeSampleApi } from './probeHttp.js';
import { sanitizeHttpExchanges } from './sanitizeHttp.js';
import { discoverAndUpsertSpecs, fetchGraphContextForFindings } from './graphContext.js';
import { analyzeComplianceWithGroq } from './groqClient.js';

/**
 * Run a full audit on the sample API
 */
export async function runAuditOnSampleApi(): Promise<ComplianceReport> {
  console.log('[Audit] Starting audit on sample API...');

  // 1. Create E2B sandbox
  console.log('[Audit] Creating E2B sandbox...');
  const sandbox = await createSandbox();

  try {
    // 2. Launch sample API inside sandbox
    console.log('[Audit] Starting sample API in sandbox...');
    await runSampleApiInSandbox(sandbox);

    // 3. Probe endpoints
    console.log('[Audit] Probing API endpoints...');
    const rawExchanges = await probeSampleApi(sandbox);
    console.log(`[Audit] Collected ${rawExchanges.length} HTTP exchanges`);

    // 4. Sanitize exchanges
    console.log('[Audit] Sanitizing HTTP exchanges...');
    const sanitizedExchanges = sanitizeHttpExchanges(rawExchanges);

    // 5. Discover and upsert specs
    console.log('[Audit] Discovering relevant specs via MCP...');
    const discoveryContext: DiscoveryContext = {
      sanitizedExchanges,
    };
    const specs = await discoverAndUpsertSpecs(discoveryContext);
    console.log(`[Audit] Discovered ${specs.length} relevant specs`);

    // 6. Fetch graph context
    console.log('[Audit] Fetching graph context from Memgraph...');
    const graphContext = await fetchGraphContextForFindings(specs);

    // 7. Analyze with Groq
    console.log('[Audit] Analyzing compliance with Groq...');
    const report = await analyzeComplianceWithGroq({
      probes: sanitizedExchanges,
      specs,
      graphContext,
    });

    console.log('[Audit] Audit complete!');
    return report;
  } finally {
    // Cleanup sandbox
    console.log('[Audit] Cleaning up sandbox...');
    await closeSandbox(sandbox);
  }
}

/**
 * Convert compliance report to a chat-friendly summary
 */
export function reportToSummary(report: ComplianceReport): string {
  const lines: string[] = [];

  lines.push(`## API Audit Results\n`);
  lines.push(`**Overall Health:** ${report.overallHealth.toUpperCase()}\n`);
  lines.push(report.summary);
  lines.push('');

  if (report.endpoints.length > 0) {
    lines.push('### Endpoint Analysis\n');

    for (const endpoint of report.endpoints) {
      const statusEmoji = {
        compliant: '✅',
        warning: '⚠️',
        critical: '❌',
      }[endpoint.status];

      lines.push(`#### ${statusEmoji} ${endpoint.method} ${endpoint.endpoint}`);
      lines.push(`Status: **${endpoint.status}**\n`);

      if (endpoint.issues.length > 0) {
        lines.push('**Issues:**');
        for (const issue of endpoint.issues) {
          lines.push(`- [${issue.severity.toUpperCase()}] ${issue.description}`);
          if (issue.rfcReferences.length > 0) {
            lines.push(`  - RFC References: ${issue.rfcReferences.join(', ')}`);
          }
          if (issue.owaspReferences.length > 0) {
            lines.push(`  - OWASP References: ${issue.owaspReferences.join(', ')}`);
          }
        }
        lines.push('');
      }

      if (endpoint.suggestions.length > 0) {
        lines.push('**Suggestions:**');
        for (const suggestion of endpoint.suggestions) {
          lines.push(`- ${suggestion}`);
        }
        lines.push('');
      }
    }
  }

  if (report.rfcsCited.length > 0 || report.owaspCited.length > 0) {
    lines.push('### Standards Referenced\n');
    if (report.rfcsCited.length > 0) {
      lines.push(`**RFCs:** ${report.rfcsCited.join(', ')}`);
    }
    if (report.owaspCited.length > 0) {
      lines.push(`**OWASP Top 10:** ${report.owaspCited.join(', ')}`);
    }
  }

  return lines.join('\n');
}
