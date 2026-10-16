import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { test } from "node:test";

test("manifest sets a minimum version without blocking future app updates", () => {
  const manifest = JSON.parse(readFileSync(new URL("../paseo-plugin.json", import.meta.url), "utf8"));
  assert.equal(manifest.requirements.paseo, ">=0.10.3");
});
