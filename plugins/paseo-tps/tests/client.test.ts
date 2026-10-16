import assert from "node:assert/strict";
import { test } from "node:test";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { contributeClient } from "../client/contribute";
import type { Live } from "../shared/contracts";

type Button = Parameters<PluginClientContext["addComposerPill"]>[0]["button"];
const streaming: Live = { agentId: "agent-1", workspaceId: "workspace-1", phase: "streaming", rate: 42.5 };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test("composer pill keeps native enabled styling, has no action, and follows live state", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let states: Live[] = [streaming];
  const created: Button[] = [];
  const updated: Partial<Button>[] = [];
  let removed = 0;
  const client = {
    rpc: async () => states,
    addComposerPill({ button }: { button: Button }) {
      created.push(button);
      return { update: (patch: Partial<Button>) => updated.push(patch), remove: () => { removed++; } };
    },
  } as unknown as PluginClientContext;
  const LightningIcon = () => null;
  const stop = contributeClient(client, LightningIcon);
  await flush();
  assert.equal(created.length, 1);
  assert.equal(created[0]?.disabled, false);
  assert.equal(created[0]?.icon, LightningIcon);
  assert.equal(created[0]?.label, "~42,5 token/s");
  const behavior = created[0]!.behavior;
  assert.equal(behavior.kind, "action");
  if (behavior.kind === "action") assert.equal(behavior.onPress(), undefined);
  states = [{ ...streaming, phase: "tools", rate: null }];
  t.mock.timers.tick(100);
  await flush();
  assert.equal(updated.at(-1)?.disabled, false);
  assert.equal(updated.at(-1)?.icon, "Wrench");
  assert.equal(updated.at(-1)?.label, "Đang chạy công cụ · TPS tạm dừng");
  states = [];
  t.mock.timers.tick(100);
  await flush();
  assert.equal(removed, 1);
  stop();
});

test("first text replaces the waiting label within the 100 ms poll interval", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let states: Live[] = [{ ...streaming, phase: "waiting", rate: null }];
  const labels: (string | undefined)[] = [];
  const client = {
    rpc: async () => states,
    addComposerPill({ button }: { button: Button }) {
      labels.push(button.label);
      return {
        update: (patch: Partial<Button>) => labels.push(patch.label),
        remove() {},
      };
    },
  } as unknown as PluginClientContext;
  const stop = contributeClient(client);
  try {
    await flush();
    assert.equal(labels.at(-1), "Đang chờ phản hồi…");
    states = [{ ...streaming, rate: null }];
    t.mock.timers.tick(99);
    await flush();
    assert.equal(labels.length, 1);
    t.mock.timers.tick(1);
    await flush();
    assert.equal(labels.at(-1), "Đang đo tốc độ…");
    states = [streaming];
    t.mock.timers.tick(100);
    await flush();
    assert.equal(labels.at(-1), "~42,5 token/s");
  } finally {
    stop();
  }
});

test("cleanup during an in-flight poll cannot resurrect UI", async () => {
  let resolve!: (states: Live[]) => void;
  const response = new Promise<Live[]>((done) => { resolve = done; });
  let created = 0;
  const client = {
    rpc: () => response,
    addComposerPill() { created++; },
  } as unknown as PluginClientContext;
  const stop = contributeClient(client);
  stop();
  resolve([streaming]);
  await flush();
  assert.equal(created, 0);
});

test("disconnect clears stale rates; a later successful poll restores them", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(console, "error", () => {});
  let fail = false;
  let removed = 0;
  let created = 0;
  const client = {
    rpc: async () => { if (fail) throw new Error("offline"); return [streaming]; },
    addComposerPill() {
      created++;
      return { update() {}, remove() { removed++; } };
    },
  } as unknown as PluginClientContext;
  const stop = contributeClient(client);
  await flush();
  fail = true;
  t.mock.timers.tick(100);
  await flush();
  assert.equal(removed, 1);
  fail = false;
  t.mock.timers.tick(2_000);
  await flush();
  assert.equal(created, 2);
  stop();
});
