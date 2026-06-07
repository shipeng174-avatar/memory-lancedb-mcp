import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: {
    ...process.env,
    SILICONFLOW_API_KEY: "test-key"
  }
});

const client = new Client({
  name: "memory-lancedb-mcp-smoke-test",
  version: "0.1.0"
});

try {
  await client.connect(transport);
  const tools = await client.listTools();
  console.log(JSON.stringify(tools.tools.map((tool) => tool.name).sort(), null, 2));
} finally {
  await client.close();
}
