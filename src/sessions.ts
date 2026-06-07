import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import type { SessionChunk } from "./types.js";

export interface IndexSessionsOptions {
  root?: string;
  scope?: string;
  maxChars?: number;
}

interface ParsedLine {
  text: string;
  sessionId?: string;
}

export async function loadSessionTranscripts(options: IndexSessionsOptions = {}): Promise<SessionChunk[]> {
  if (!config.sessionTranscripts.enabled) {
    throw new Error("Session transcript indexing is disabled. Set SESSION_TRANSCRIPTS_ENABLED=true to enable it.");
  }

  const root = path.resolve(options.root ?? config.sessionTranscripts.root);
  const maxChars = Math.max(400, options.maxChars ?? config.sessionTranscripts.maxChars);
  const rootInfo = await stat(root);
  const baseRoot = rootInfo.isFile() ? path.dirname(root) : root;
  const files = await findJsonlFiles(root);
  const chunks: SessionChunk[] = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    chunks.push(...chunkJsonl(baseRoot, file, content, maxChars));
  }

  return chunks;
}

async function findJsonlFiles(root: string): Promise<string[]> {
  const info = await stat(root);
  if (info.isFile()) {
    return root.toLowerCase().endsWith(".jsonl") ? [root] : [];
  }

  return walkJsonl(root);
}

async function walkJsonl(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkJsonl(fullPath)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".jsonl")) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function chunkJsonl(root: string, file: string, content: string, maxChars: number): SessionChunk[] {
  const lines = content.split(/\r?\n/);
  const chunks: SessionChunk[] = [];
  let buffer: string[] = [];
  let startLine = 1;
  let sessionId: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const parsed = parseTranscriptLine(lines[index]);
    if (!parsed?.text) {
      continue;
    }

    sessionId ??= parsed.sessionId;
    const nextLength = buffer.join("\n").length + parsed.text.length + 1;
    if (nextLength > maxChars && buffer.length > 0) {
      chunks.push(makeChunk(root, file, buffer, startLine, index, sessionId));
      buffer = [];
      startLine = index + 1;
    }

    buffer.push(parsed.text);
  }

  if (buffer.length) {
    chunks.push(makeChunk(root, file, buffer, startLine, lines.length, sessionId));
  }

  return chunks;
}

function parseTranscriptLine(line: string): ParsedLine | undefined {
  if (!line.trim()) {
    return undefined;
  }

  try {
    const value = JSON.parse(line) as Record<string, unknown>;
    const role = stringValue(value.role) ?? stringValue(value.type) ?? stringValue(value.sender);
    const content =
      stringValue(value.content) ??
      stringValue(value.text) ??
      stringValue(value.message) ??
      contentFromNested(value.message) ??
      contentFromNested(value.content);

    if (!content) {
      return undefined;
    }

    return {
      text: role ? `${role}: ${content}` : content,
      sessionId: stringValue(value.sessionId) ?? stringValue(value.session_id) ?? stringValue(value.conversationId)
    };
  } catch {
    return { text: line };
  }
}

function contentFromNested(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const object = value as Record<string, unknown>;
  return stringValue(object.content) ?? stringValue(object.text);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function makeChunk(
  root: string,
  file: string,
  lines: string[],
  startLine: number,
  endLine: number,
  sessionId?: string
): SessionChunk {
  const relativePath = path.relative(root, file).replace(/\\/g, "/");
  return {
    text: lines.join("\n").trim(),
    path: relativePath,
    startLine,
    endLine,
    citation: `${relativePath}:${startLine}-${endLine}`,
    sessionId
  };
}
