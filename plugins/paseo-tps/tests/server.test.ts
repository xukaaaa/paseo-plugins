import assert from "node:assert/strict";
import { test } from "node:test";
import type { PluginHookContext, PluginLifecycleEvents, PluginServerContext } from "@getpaseo/plugin/server";
import type { PaseoAgentTimelineEvent, PaseoAgentTimelineSubscription } from "@getpaseo/client";
import type { PluginTimelineItem } from "@getpaseo/protocol/agent-types";
import type { Live } from "../shared/contracts";
import { summarySchema } from "../shared/contracts";
import { contributeServer } from "../server/contribute";

type Start = PluginLifecycleEvents["agent.turn_started"];
type WireEvent = Extract<PaseoAgentTimelineEvent["event"], { provider: string }>;
const agent: Start["agent"] = {
  id: "agent-1", workspaceId: "workspace-1", parentAgentId: null,
  provider: "pi", cwd: "/tmp", title: null,
};

function harness() {
  const hooks = new Map<string, (event: unknown, context: PluginHookContext) => void>();
  let read: () => Live[] = () => [];
  let now = 0;
  let released = 0;
  let subscriptions = 0;
  let delivery: ((event: PaseoAgentTimelineEvent) => void) | undefined;
  const saved: Omit<PluginTimelineItem, "pluginId">[] = [];
  const context = {
    paseo: { agents: { ref: () => ({ timeline: {
      subscribe(callback: (event: PaseoAgentTimelineEvent) => void) {
        subscriptions++;
        delivery = callback;
        const unsubscribe = Object.assign(() => { released++; }, {
          ready: Promise.resolve(),
        }) as PaseoAgentTimelineSubscription;
        return unsubscribe;
      },
      append: async (row: Omit<PluginTimelineItem, "pluginId">) => {
        saved.push(structuredClone(row));
        return { seq: saved.length, epoch: "epoch-1" };
      },
    } }) } },
    signal: new AbortController().signal,
  } as unknown as PluginHookContext;
  const server = {
    on(name: string, callback: (event: unknown, context: PluginHookContext) => void) {
      hooks.set(name, callback);
      return () => { hooks.delete(name); };
    },
    handle(_contract: unknown, callback: () => Live[]) { read = callback; },
  } as unknown as PluginServerContext;
  const stop = contributeServer(server, () => now);
  return {
    start(provider = "pi", turnId = "turn-1") {
      hooks.get("agent.turn_started")!({ agent: { ...agent, provider }, turnId }, context);
    },
    emit(event: WireEvent, at = now) {
      now = at;
      delivery?.({ agentId: agent.id, event, timestamp: new Date(at).toISOString() });
    },
    reconnect() {
      delivery?.({ agentId: agent.id, subscriptionId: "new", event: { type: "subscription_restored" } });
    },
    archive() { hooks.get("agent.archived")!({ agent, archivedAt: "2026-10-16" }, context); },
    live: () => read(), saved, stop,
    get subscriptions() { return subscriptions; },
    get released() { return released; },
  };
}
const text = (value: string): WireEvent => ({
  type: "timeline", provider: "pi", turnId: "turn-1",
  item: { type: "assistant_message", text: value, messageId: "message-1" },
});

test("server writes exactly one durable footer after completion, never during stream", async () => {
  const h = harness();
  h.start();
  assert.equal(h.live()[0]?.phase, "waiting");
  h.emit(text("Xin chào"), 100);
  h.emit(text(", đã kiểm tra thành công."), 1_100);
  assert.equal(h.saved.length, 0);
  assert.ok(h.live()[0]!.rate! > 0);
  h.emit({ type: "turn_completed", provider: "pi", turnId: "turn-1" });
  h.emit({ type: "turn_completed", provider: "pi", turnId: "turn-1" });
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0]?.kind, "response-tps");
  assert.equal(summarySchema.parse(h.saved[0]?.data).messageId, "message-1");
  assert.equal(h.live().length, 0);
  assert.equal(h.released, 1);
  await h.stop();
});

test("non-Pi turns are ignored", async () => {
  const h = harness();
  h.start("claude");
  assert.equal(h.subscriptions, 0);
  assert.deepEqual(h.live(), []);
  await h.stop();
});

test("failure and cancellation remove live TPS without fabricating a completed footer", async () => {
  for (const terminal of [
    { type: "turn_failed", provider: "pi", turnId: "turn-1", error: "failed" },
    { type: "turn_canceled", provider: "pi", turnId: "turn-1", reason: "interrupted" },
  ] as const) {
    const h = harness();
    h.start();
    h.emit(text("Hello"), 0);
    h.emit(text(" world"), 1_000);
    h.emit(terminal);
    assert.equal(h.saved.length, 0);
    assert.equal(h.live().length, 0);
    await h.stop();
  }
});

test("an observation gap cannot produce a misleading persisted result", async () => {
  const h = harness();
  h.start();
  h.emit(text("Hello"), 0);
  h.emit(text(" world"), 1_000);
  h.reconnect();
  assert.equal(h.live()[0]?.phase, "unavailable");
  h.emit({ type: "turn_completed", provider: "pi", turnId: "turn-1" });
  assert.equal(h.saved.length, 0);
  await h.stop();
});

test("old-turn events are ignored and archive/unload release observations", async () => {
  const h = harness();
  h.start();
  h.emit({ type: "turn_completed", provider: "pi", turnId: "old-turn" });
  assert.equal(h.live().length, 1);
  h.archive();
  assert.equal(h.released, 1);
  h.start();
  await h.stop();
  assert.equal(h.released, 2);
  assert.equal(h.live().length, 0);
});
