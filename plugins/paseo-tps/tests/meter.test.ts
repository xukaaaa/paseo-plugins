import assert from "node:assert/strict";
import { test } from "node:test";
import { Meter } from "../server/meter";
import { liveLabel, formatRate } from "../shared/format";
import { summarySchema } from "../shared/contracts";
import type { AgentStreamEvent } from "@getpaseo/protocol/agent-types";

function text(meter: Meter, at: number, value: string, messageId = "message-1") {
  meter.accept({ type: "timeline", provider: "pi", item: {
    type: "assistant_message", text: value, messageId,
  } }, at);
}
function tool(meter: Meter, at: number, callId: string, status: "running" | "completed") {
  meter.accept({ type: "timeline", provider: "pi", item: {
    type: "tool_call", callId, name: "bash", status, error: null,
    detail: { type: "shell", command: "npm test" },
  } } as AgentStreamEvent, at);
}

test("does not invent TPS for history, empty output, or single chunks", () => {
  const meter = new Meter();
  assert.equal(meter.summary(), null);
  assert.equal(meter.liveRate(), null);
  text(meter, 100_000, "Đây là toàn bộ câu trả lời.");
  assert.equal(meter.summary(), null);
  assert.equal(meter.liveRate(), null);
});

test("streams a sliding rate, then preserves a validated final result", () => {
  const meter = new Meter();
  text(meter, 10_000, "Xin chào");
  text(meter, 10_050, ", mình đang");
  assert.equal(meter.liveRate(), null);
  text(meter, 11_000, " kiểm tra thay đổi của bạn.");
  assert.ok(meter.liveRate()! > 0);
  const summary = summarySchema.parse(meter.summary());
  assert.equal(summary.messageId, "message-1");
  assert.equal(summary.activeMs, 1_000);
  assert.equal(summary.estimated, true);
  assert.equal(summary.tokenizer, "o200k_base");
  assert.deepEqual(summarySchema.parse(JSON.parse(JSON.stringify(summary))), summary);
});

test("first text leaves waiting immediately and live TPS warms up before final summaries", () => {
  const meter = new Meter();
  text(meter, 0, "Xin");
  assert.deepEqual(meter.liveState(0), { phase: "streaming", rate: null });
  text(meter, 99, " chào");
  assert.deepEqual(meter.liveState(99), { phase: "streaming", rate: null });
  text(meter, 100, ", bạn nhé.");
  assert.equal(meter.liveState(100).phase, "streaming");
  assert.ok(meter.liveState(100).rate! > 0);
  assert.equal(meter.summary(), null); // Final results still require 500 ms.
});

test("tool execution and thinking time are excluded, even across long gaps", () => {
  const meter = new Meter();
  text(meter, 0, "A");
  text(meter, 1_000, " useful answer.");
  tool(meter, 1_200, "tool-1", "running");
  tool(meter, 1_300, "tool-2", "running");
  assert.deepEqual(meter.liveState(30_000), { phase: "tools", rate: null });
  tool(meter, 30_000, "tool-1", "completed");
  assert.equal(meter.phase, "tools");
  tool(meter, 31_000, "tool-2", "completed");
  assert.equal(meter.phase, "waiting");
  text(meter, 32_000, " More");
  text(meter, 33_000, " useful information.");
  meter.accept({ type: "timeline", provider: "pi", item: { type: "reasoning", text: "hidden" } }, 33_500);
  assert.equal(meter.phase, "thinking");
  text(meter, 90_000, " Final");
  text(meter, 91_000, " explanation.");
  assert.equal(meter.summary()?.activeMs, 3_000);
});

test("final footer measures the final response, not earlier pre-tool messages", () => {
  const meter = new Meter();
  text(meter, 0, "I will", "before-tool");
  text(meter, 1_000, " run a test.", "before-tool");
  tool(meter, 1_100, "tool", "running");
  tool(meter, 50_000, "tool", "completed");
  text(meter, 51_000, "Đã", "final-response");
  text(meter, 53_000, " hoàn tất kiểm tra.", "final-response");
  assert.equal(meter.summary()?.messageId, "final-response");
  assert.equal(meter.summary()?.activeMs, 2_000);
});

test("text streaming concurrently with a tool still has TPS", () => {
  const meter = new Meter();
  tool(meter, 0, "background-tool", "running");
  text(meter, 10, "Đang");
  tool(meter, 500, "background-tool", "running"); // Tool output updates must not reset the segment.
  text(meter, 1_010, " giải thích kết quả.");
  assert.equal(meter.liveState(1_100).phase, "streaming");
  assert.ok(meter.liveRate()! > 0);
  assert.equal(meter.liveState(5_000).phase, "tools");
});

test("no stale live rate during a silent stall", () => {
  const meter = new Meter();
  text(meter, 0, "Hello");
  text(meter, 1_000, " world.");
  assert.equal(meter.liveState(4_000).rate, null);
  assert.equal(meter.liveState(4_000).phase, "waiting");
});

test("observation gaps invalidate the final result", () => {
  const meter = new Meter();
  text(meter, 0, "Hello");
  text(meter, 1_000, " world.");
  meter.invalidate();
  text(meter, 2_000, " More text.");
  assert.equal(meter.summary(), null);
  assert.equal(meter.liveState(2_000).phase, "unavailable");
});

test("special-token-like text and Unicode are ordinary assistant output", () => {
  const meter = new Meter();
  text(meter, 0, "⚡ Xin chào");
  text(meter, 1_000, " <|endoftext|> 👨‍👩‍👧‍👦 tiếng Việt");
  assert.ok(meter.summary()!.estimatedTokens > 0);
});

test("labels use Vietnamese formatting and preserve the approximation marker", () => {
  assert.equal(formatRate(42.54), "~42,5 token/s");
  assert.equal(liveLabel({ phase: "tools", rate: null }), "Đang chạy công cụ · TPS tạm dừng");
  assert.equal(liveLabel({ phase: "streaming", rate: null }), "Đang đo tốc độ…");
});
