import { config } from "./config.js";
import type { RecallResult } from "./types.js";

interface RerankResponse {
  results?: Array<{
    index: number;
    relevance_score?: number;
    score?: number;
  }>;
}

export async function maybeRerank(query: string, results: RecallResult[]): Promise<RecallResult[]> {
  if (!config.rerank.enabled || results.length < 2) {
    return results;
  }

  if (!config.rerank.apiKey) {
    throw new Error("RERANK_ENABLED=true but RERANK_API_KEY/SILICONFLOW_API_KEY is missing.");
  }

  const response = await fetch(`${config.rerank.baseUrl}/rerank`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.rerank.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.rerank.model,
      query,
      documents: results.map((item) => item.text)
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Rerank request failed: ${response.status} ${detail}`);
  }

  const body = (await response.json()) as RerankResponse;
  if (!body.results?.length) {
    return results;
  }

  const byIndex = new Map(results.map((result, index) => [index, result]));

  return body.results
    .map((item) => {
      const result = byIndex.get(item.index);
      if (!result) {
        return undefined;
      }

      return {
        ...result,
        score: item.relevance_score ?? item.score ?? result.score
      };
    })
    .filter((item): item is RecallResult => Boolean(item));
}
