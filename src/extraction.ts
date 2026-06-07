import { config } from "./config.js";
import type { ExtractedMemory, MemoryCategory } from "./types.js";

interface ChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface ExtractOptions {
  text: string;
  source?: string;
  maxMemories?: number;
  minImportance?: number;
}

const categories: MemoryCategory[] = ["profile", "preference", "entity", "event", "case", "pattern", "note"];

export async function extractMemories(options: ExtractOptions): Promise<ExtractedMemory[]> {
  if (!config.extraction.enabled) {
    throw new Error("Smart extraction is disabled. Set EXTRACTION_ENABLED=true to enable it.");
  }

  if (!config.extraction.apiKey) {
    throw new Error("Missing EXTRACTION_API_KEY or SILICONFLOW_API_KEY.");
  }

  const maxMemories = Math.max(1, Math.min(options.maxMemories ?? 8, 20));
  const minImportance = options.minImportance ?? config.extraction.minImportance;

  const response = await fetch(`${config.extraction.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.extraction.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.extraction.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract durable long-term memories for an AI assistant. Return strict JSON only. Categories: profile, preference, entity, event, case, pattern, note. Keep only facts likely to matter in future sessions. Avoid transient chatter, secrets, passwords, and raw credentials."
        },
        {
          role: "user",
          content: JSON.stringify({
            instructions: {
              outputShape: {
                memories: [
                  {
                    text: "durable memory in the user's language",
                    category: "profile|preference|entity|event|case|pattern|note",
                    importance: "number from 0 to 1",
                    tags: ["short", "tags"],
                    metadata: {}
                  }
                ]
              },
              maxMemories,
              minImportance
            },
            text: options.text
          })
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Extraction request failed: ${response.status} ${detail}`);
  }

  const body = (await response.json()) as ChatResponse;
  const content = body.choices?.[0]?.message?.content;
  if (!content) {
    return [];
  }

  return parseExtractedMemories(content, options.source, minImportance).slice(0, maxMemories);
}

function parseExtractedMemories(content: string, source = "smart-extraction", minImportance: number): ExtractedMemory[] {
  const parsed = parseJsonObject(content);
  const rawMemories = Array.isArray(parsed.memories) ? parsed.memories : [];

  return rawMemories
    .map((item): ExtractedMemory | undefined => {
      if (!item || typeof item !== "object") {
        return undefined;
      }

      const candidate = item as Record<string, unknown>;
      const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
      const category = normalizeCategory(candidate.category);
      const importance = normalizeImportance(candidate.importance);

      if (!text || importance < minImportance) {
        return undefined;
      }

      return {
        text,
        category,
        importance,
        source,
        tags: Array.isArray(candidate.tags) ? candidate.tags.filter((tag): tag is string => typeof tag === "string") : [],
        metadata: candidate.metadata && typeof candidate.metadata === "object" ? (candidate.metadata as Record<string, unknown>) : {}
      };
    })
    .filter((item): item is ExtractedMemory => Boolean(item));
}

function parseJsonObject(content: string): Record<string, unknown> {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return {};
    }

    try {
      return JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}

function normalizeCategory(value: unknown): MemoryCategory {
  return typeof value === "string" && categories.includes(value as MemoryCategory) ? (value as MemoryCategory) : "note";
}

function normalizeImportance(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 0.5;
  }

  return Math.min(Math.max(parsed, 0), 1);
}
