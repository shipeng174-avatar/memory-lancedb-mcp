const secretPatterns = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/g,
  /\b(?:sk|ghp|gho|github_pat|hf|sf)_[A-Za-z0-9_=-]{16,}\b/g,
  /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
  /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s]{8,}/gi
];

export function redactSecrets(input: string): string {
  return secretPatterns.reduce((text, pattern) => text.replace(pattern, "[REDACTED_SECRET]"), input);
}

export function redactMetadataSecrets(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      typeof value === "string" ? redactSecrets(value) : value
    ])
  );
}
