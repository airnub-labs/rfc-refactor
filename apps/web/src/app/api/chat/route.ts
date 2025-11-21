import { NextRequest, NextResponse } from 'next/server';
import {
  runAuditOnSampleApi,
  reportToSummary,
  groqChat,
  type ChatMessage,
  type ComplianceReport,
} from '@e2b-auditor/core';

// Special token to trigger audit
const AUDIT_TRIGGER = '__RUN_SAMPLE_AUDIT__';

interface ChatRequest {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

interface ChatResponse {
  message: string;
  report?: ComplianceReport;
}

export async function POST(request: NextRequest): Promise<NextResponse<ChatResponse>> {
  try {
    const body: ChatRequest = await request.json();
    const { messages } = body;

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { message: 'No messages provided' },
        { status: 400 }
      );
    }

    // Get the last user message
    const lastMessage = messages[messages.length - 1];

    // Check if this is an audit request
    if (lastMessage.role === 'user' && lastMessage.content.includes(AUDIT_TRIGGER)) {
      // Run the audit
      console.log('[API] Running audit on sample API...');
      const report = await runAuditOnSampleApi();

      // Convert to chat summary
      const summary = reportToSummary(report);

      return NextResponse.json({
        message: summary,
        report,
      });
    }

    // Otherwise, treat as a general question
    // Build messages for Groq
    const groqMessages: ChatMessage[] = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const response = await groqChat({
      messages: groqMessages,
    });

    return NextResponse.json({
      message: response.content,
    });
  } catch (error) {
    console.error('[API] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      { message: `Error: ${errorMessage}` },
      { status: 500 }
    );
  }
}
