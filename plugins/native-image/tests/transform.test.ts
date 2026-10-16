import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeCard, encodeCard, PREFIX } from "../shared/protocol";
import { transformImageMessage } from "../client/transform";

const artifact = { artifactId: "a".repeat(64), mimeType: "image/png" as const };

test("bridge and transformer are versioned, strict and leave normal messages untouched", () => {
  const card = { id: "ig_test", status: "completed" as const, artifact };
  assert.deepEqual(decodeCard(encodeCard(card)), card);
  assert.deepEqual(transformImageMessage(encodeCard(card))?.items[0].data, card);
  for (const text of ["Hello", PREFIX + "{", PREFIX + JSON.stringify({ ...card, unexpected: 1 }), PREFIX + JSON.stringify({ id: "bad", status: "completed" }), PREFIX + "x".repeat(9000)]) {
    assert.equal(decodeCard(text), undefined);
    assert.equal(transformImageMessage(text), undefined);
  }
  assert.equal(decodeCard("prefix " + encodeCard(card)), undefined);
});

test("transformer preserves captions and multiple cards after Paseo coalesces assistant rows", () => {
  const first = { id: "ig_first", status: "completed" as const, artifact };
  const second = { ...first, id: "ig_second" };
  const text = "Here are your images.\n" + encodeCard(first) + encodeCard(second) + "Originals are saved.";
  const result = transformImageMessage(text)!;
  assert.equal(result.items.length, 4);
  assert.deepEqual(result.items.map((item) => item.kind), ["native-image-caption", "native-image", "native-image", "native-image-caption"]);
  assert.deepEqual(result.items[0].data, { text: "Here are your images.\n" });
  assert.deepEqual(result.items[3].data, { text: "Originals are saved." });
});
