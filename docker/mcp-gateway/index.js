import express from 'express';

const app = express();
const PORT = 8080;

const MEMGRAPH_MCP_URL = process.env.MEMGRAPH_MCP_URL || 'http://memgraph-mcp:3000';
const PERPLEXITY_MCP_URL = process.env.PERPLEXITY_MCP_URL || 'http://perplexity-mcp:3000';

app.use(express.json());

// Route MCP tool calls to appropriate servers
app.post('/tools/:toolName', async (req, res) => {
  const { toolName } = req.params;
  const params = req.body;

  try {
    let targetUrl;

    // Memgraph MCP tools
    if (toolName.startsWith('memgraph_mcp.')) {
      const tool = toolName.replace('memgraph_mcp.', '');
      targetUrl = `${MEMGRAPH_MCP_URL}/tools/${tool}`;
    }
    // Perplexity MCP tools - support multiple naming conventions
    else if (toolName.startsWith('perplexity_mcp.')) {
      const tool = toolName.replace('perplexity_mcp.', '');
      targetUrl = `${PERPLEXITY_MCP_URL}/tools/${tool}`;
    }
    // E2B gateway format: perplexity.perplexity_ask
    else if (toolName.startsWith('perplexity.')) {
      const tool = toolName.replace('perplexity.', '');
      targetUrl = `${PERPLEXITY_MCP_URL}/tools/${tool}`;
    }
    // Direct tool names (for E2B gateway compatibility)
    else if (['perplexity_ask', 'perplexity_search', 'perplexity_research'].includes(toolName)) {
      targetUrl = `${PERPLEXITY_MCP_URL}/tools/${toolName}`;
    }
    else {
      return res.status(400).json({ error: `Unknown tool: ${toolName}` });
    }

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error(`Error calling ${toolName}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(PORT, () => {
  console.log(`MCP Gateway running on port ${PORT}`);
});
