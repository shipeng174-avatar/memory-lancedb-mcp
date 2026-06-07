import assert from "node:assert/strict";
import test from "node:test";
import { redactMetadataSecrets, redactSecrets } from "../dist/safety.js";

test("redactSecrets masks common token shapes", () => {
  const input = [
    "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
    "api_key=sk_abcdefghijklmnopqrstuvwxyz123456",
    "jwt=aaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbb.cccccccccccccccccccc"
  ].join("\n");

  const redacted = redactSecrets(input);
  assert.equal(redacted.includes("abcdefghijklmnopqrstuvwxyz123456"), false);
  assert.equal(redacted.includes("[REDACTED_SECRET]"), true);
});

test("redactMetadataSecrets masks string metadata values", () => {
  const metadata = redactMetadataSecrets({
    note: "token: ghp_abcdefghijklmnopqrstuvwxyz123456",
    count: 3
  });

  assert.equal(metadata.note, "[REDACTED_SECRET]");
  assert.equal(metadata.count, 3);
});
