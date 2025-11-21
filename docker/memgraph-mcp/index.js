import express from 'express';
import neo4j from 'neo4j-driver';

const app = express();
const PORT = 3000;

const MEMGRAPH_HOST = process.env.MEMGRAPH_HOST || 'memgraph';
const MEMGRAPH_PORT = process.env.MEMGRAPH_PORT || '7687';
const MEMGRAPH_USER = process.env.MEMGRAPH_USER || 'memgraph';
const MEMGRAPH_PASSWORD = process.env.MEMGRAPH_PASSWORD || 'memgraph';

const driver = neo4j.driver(
  `bolt://${MEMGRAPH_HOST}:${MEMGRAPH_PORT}`,
  neo4j.auth.basic(MEMGRAPH_USER, MEMGRAPH_PASSWORD)
);

app.use(express.json());

// Run Cypher query
app.post('/tools/run_query', async (req, res) => {
  const { query } = req.body;
  const session = driver.session();

  try {
    const result = await session.run(query);
    const records = result.records.map(record => {
      const obj = {};
      record.keys.forEach(key => {
        obj[key] = record.get(key);
      });
      return obj;
    });
    res.json(records);
  } catch (error) {
    console.error('Memgraph query error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Get schema
app.post('/tools/get_schema', async (req, res) => {
  const session = driver.session();

  try {
    const result = await session.run('CALL schema.node_type_properties()');
    const schema = result.records.map(record => ({
      nodeType: record.get('nodeType'),
      propertyName: record.get('propertyName'),
      propertyTypes: record.get('propertyTypes'),
    }));
    res.json(schema);
  } catch (error) {
    console.error('Memgraph schema error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(PORT, () => {
  console.log(`Memgraph MCP Server running on port ${PORT}`);
});
