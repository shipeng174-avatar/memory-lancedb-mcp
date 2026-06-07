#!/usr/bin/env node
import { MemoryStore } from "./store.js";

const store = new MemoryStore();
const [command, ...args] = process.argv.slice(2);

try {
  switch (command) {
    case "stats":
      print(await store.stats());
      break;
    case "list":
      print(await store.list(readOption(args, "--scope") ?? "global", numberOption(args, "--limit", 50)));
      break;
    case "export":
      print(
        await store.export({
          scope: readOption(args, "--scope"),
          outputPath: readOption(args, "--output")
        })
      );
      break;
    case "import":
      print(
        await store.importMemories({
          inputPath: requiredOption(args, "--input"),
          scope: readOption(args, "--scope")
        })
      );
      break;
    case "decay-preview":
      print(
        await store.decayPreview(
          readOption(args, "--scope") ?? "global",
          numberOption(args, "--threshold", undefined),
          numberOption(args, "--min-age-days", undefined)
        )
      );
      break;
    case "prune":
      print(
        await store.prune(
          readOption(args, "--scope") ?? "global",
          numberOption(args, "--threshold", undefined),
          numberOption(args, "--min-age-days", undefined),
          !args.includes("--yes")
        )
      );
      break;
    case "help":
    case undefined:
      help();
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function requiredOption(args: string[], name: string): string {
  const value = readOption(args, name);
  if (!value) {
    throw new Error(`Missing required option ${name}`);
  }
  return value;
}

function numberOption(args: string[], name: string, fallback: number | undefined): number | undefined {
  const value = readOption(args, name);
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number for ${name}: ${value}`);
  }
  return parsed;
}

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function help(): void {
  console.log(`memory-lancedb-mcp-cli

Commands:
  stats
  list [--scope global] [--limit 50]
  export [--scope global] [--output backup.json]
  import --input backup.json [--scope global]
  decay-preview [--scope global] [--threshold 0.12] [--min-age-days 30]
  prune [--scope global] [--threshold 0.12] [--min-age-days 30] [--yes]

Notes:
  prune defaults to dry run. Pass --yes to delete candidates.
`);
}
