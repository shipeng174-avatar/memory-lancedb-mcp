import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import type { CorpusChunk } from "./types.js";

export interface IndexCorpusOptions {
  root?: string;
  scope?: string;
  maxChars?: number;
}

export async function loadCanonicalCorpus(options: IndexCorpusOptions = {}): Promise<CorpusChunk[]> {
  if (!config.canonicalCorpus.enabled) {
    throw new Error("Canonical corpus indexing is disabled. Set CANONICAL_CORPUS_ENABLED=true to enable it.");
  }

  const root = path.resolve(options.root ?? config.canonicalCorpus.root);
  const maxChars = Math.max(400, options.maxChars ?? config.canonicalCorpus.maxChars);
  const files = await findCanonicalFiles(root);
  const chunks: CorpusChunk[] = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    chunks.push(...chunkMarkdown(root, file, content, maxChars));
  }

  return chunks;
}

async function findCanonicalFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const memoryMd = path.join(root, "MEMORY.md");

  if (await exists(memoryMd)) {
    files.push(memoryMd);
  }

  const memoryDir = path.join(root, "memory");
  if (await exists(memoryDir)) {
    files.push(...(await walkMarkdown(memoryDir)));
  }

  return [...new Set(files)].sort();
}

async function walkMarkdown(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdown(fullPath)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

function chunkMarkdown(root: string, file: string, content: string, maxChars: number): CorpusChunk[] {
  const lines = content.split(/\r?\n/);
  const chunks: CorpusChunk[] = [];
  let buffer: string[] = [];
  let startLine = 1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nextLength = buffer.join("\n").length + line.length + 1;
    const headingBoundary = line.startsWith("#") && buffer.length > 0;

    if ((nextLength > maxChars || headingBoundary) && buffer.length > 0) {
      chunks.push(makeChunk(root, file, buffer, startLine, index));
      buffer = [];
      startLine = index + 1;
    }

    buffer.push(line);
  }

  if (buffer.some((line) => line.trim())) {
    chunks.push(makeChunk(root, file, buffer, startLine, lines.length));
  }

  return chunks.filter((chunk) => chunk.text.trim().length > 0);
}

function makeChunk(root: string, file: string, lines: string[], startLine: number, endLine: number): CorpusChunk {
  const relativePath = path.relative(root, file).replace(/\\/g, "/");
  return {
    text: lines.join("\n").trim(),
    path: relativePath,
    startLine,
    endLine,
    citation: `${relativePath}:${startLine}-${endLine}`
  };
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}
