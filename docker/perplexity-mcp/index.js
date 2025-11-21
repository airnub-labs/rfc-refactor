import express from 'express';

const app = express();
const PORT = 3000;

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || '';

app.use(express.json());

// Search with Perplexity
app.post('/tools/search', async (req, res) => {
  const { query } = req.body;

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          {
            role: 'user',
            content: query,
          },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Perplexity API error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    const content = result.choices[0]?.message?.content || '';

    res.json(content);
  } catch (error) {
    console.error('Perplexity search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(PORT, () => {
  console.log(`Perplexity MCP Server running on port ${PORT}`);
});
