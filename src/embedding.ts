import { config, requireEmbeddingApiKey } from "./config.js";

interface EmbeddingResponse {
  data?: Array<{
    embedding?: number[];
  }>;
}

export async function embedText(input: string): Promise<number[]> {
  if (config.embedding.provider === "mock") {
    return mockEmbedding(input);
  }

  requireEmbeddingApiKey();

  const response = await fetch(`${config.embedding.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.embedding.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.embedding.model,
      input
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Embedding request failed: ${response.status} ${detail}`);
  }

  const body = (await response.json()) as EmbeddingResponse;
  const embedding = body.data?.[0]?.embedding;

  if (!embedding?.length) {
    throw new Error("Embedding response did not include a vector.");
  }

  return embedding;
}

function mockEmbedding(input: string): number[] {
  const values = new Array<number>(16).fill(0);
  for (let index = 0; index < input.length; index += 1) {
    values[index % values.length] += input.charCodeAt(index) / 255;
  }

  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? values : values.map((value) => value / norm);
}
