import { createGroq } from '@ai-sdk/groq';
import { streamText } from 'ai';
import {
  runAuditOnSampleApi,
  reportToSummary,
  AUDIT_TRIGGER,
  type ComplianceReport,
} from '@e2b-auditor/core';

// System prompt for the RFC/OWASP auditor
const SYSTEM_PROMPT = `You are an expert RFC and OWASP Top 10 compliance auditor for HTTP APIs.

Your role is to:
1. Answer questions about HTTP RFC compliance and OWASP Top 10 security standards
2. Explain best practices for API security and HTTP semantics
3. Help developers understand how to fix compliance issues

You have deep knowledge of:
- HTTP/1.1 RFCs (7230-7235) and HTTP/2 (RFC 9110-9114)
- OWASP Top 10:2021 security risks
- API security best practices
- Common security vulnerabilities and how to prevent them

Be concise, specific, and reference relevant RFC sections or OWASP categories when applicable.`;

// Initialize Groq client
const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    if (!messages || messages.length === 0) {
      return new Response('No messages provided', { status: 400 });
    }

    // Get the last user message
    const lastMessage = messages[messages.length - 1];

    // Check if this is an audit request
    if (lastMessage.role === 'user' && lastMessage.content.includes(AUDIT_TRIGGER)) {
      console.log('[API] Running audit on sample API...');

      try {
        // Run the audit
        const report: ComplianceReport = await runAuditOnSampleApi();

        // Convert to chat summary
        const summary = reportToSummary(report);

        // Embed report data in hidden comment for client to extract
        const responseWithReport = `${summary}\n\n<!--REPORT:${JSON.stringify(report)}:REPORT-->`;

        // Return as a text response that AI SDK's useChat can handle
        return new Response(responseWithReport, {
          headers: {
            'Content-Type': 'text/plain',
          },
        });
      } catch (error) {
        console.error('[API] Audit error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return new Response(`Error running audit: ${errorMessage}`, {
          status: 500,
          headers: {
            'Content-Type': 'text/plain',
          },
        });
      }
    }

    // For normal chat, use AI SDK with Groq for streaming
    const result = await streamText({
      model: groq('llama-3.1-70b-versatile'),
      system: SYSTEM_PROMPT,
      messages,
      temperature: 0.3,
      maxTokens: 2048,
    });

    // Return the stream response
    return result.toDataStreamResponse();
  } catch (error) {
    console.error('[API] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return new Response(`Error: ${errorMessage}`, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }
}
