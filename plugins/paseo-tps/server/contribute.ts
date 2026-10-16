import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { PluginServerContext, PluginHookContext } from "@getpaseo/plugin/server";
import type { PaseoAgentTimelineSubscription } from "@getpaseo/client";
import { FOOTER_KIND, liveRpc } from "../shared/contracts";
import { Meter } from "./meter";

type Observation = {
  meter: Meter;
  workspaceId: string | null;
  unsubscribe?: PaseoAgentTimelineSubscription;
  done: boolean;
};

export function contributeServer(
  server: PluginServerContext,
  clock: () => number = () => performance.now(),
): () => Promise<void> {
  const observations = new Map<string, Observation>();
  const pendingWrites = new Set<Promise<void>>();
  let stopped = false;

  const remove = (agentId: string) => {
    const observation = observations.get(agentId);
    if (!observation) return;
    observation.done = true;
    observation.unsubscribe?.();
    observations.delete(agentId);
  };

  server.handle(liveRpc, () => [...observations].map(([agentId, { meter, workspaceId }]) => ({
    agentId,
    workspaceId,
    ...meter.liveState(clock()),
  })));

  const start = (agentId: string, workspaceId: string | null, turnId: string | null, context: PluginHookContext) => {
    if (stopped) return;
    remove(agentId);
    const observation: Observation = { meter: new Meter(), workspaceId, done: false };
    observations.set(agentId, observation);
    const agent = context.paseo.agents.ref(agentId);
    const unsubscribe = agent.timeline.subscribe(({ event }) => {
      if (stopped || observation.done) return;
      if (event.type === "error") {
        remove(agentId);
        return;
      }
      if (event.type === "subscription_restored" || event.type === "replacement") {
        observation.meter.invalidate();
        return;
      }
      if ("turnId" in event && event.turnId && turnId && event.turnId !== turnId) return;
      observation.meter.accept(event, clock());
      if (event.type !== "turn_completed" && event.type !== "turn_failed" && event.type !== "turn_canceled") return;
      const summary = event.type === "turn_completed" ? observation.meter.summary() : null;
      remove(agentId);
      if (!summary) return;
      // Canonical plugin rows survive app reload, timeline refetch and daemon restart.
      // Store only metrics, not a second copy of the assistant's text.
      const write = agent.timeline.append({
        type: "plugin",
        id: `response-${randomUUID()}`,
        kind: FOOTER_KIND,
        version: 1,
        data: summary,
      }).then(() => undefined).catch((error: unknown) => {
        console.error("Không lưu được tốc độ phản hồi", error);
      });
      pendingWrites.add(write);
      void write.finally(() => pendingWrites.delete(write));
    });
    observation.unsubscribe = unsubscribe;
    void unsubscribe.ready.catch((error: unknown) => {
      if (!observation.done) {
        remove(agentId);
        console.error("Không theo dõi được tốc độ phản hồi", error);
      }
    });
  };

  const cleanups = [
    server.on("agent.turn_started", ({ agent, turnId }, context) => {
      if (agent.provider === "pi") start(agent.id, agent.workspaceId, turnId, context);
    }),
    server.on("agent.archived", ({ agent }) => remove(agent.id)),
  ];

  return async () => {
    stopped = true;
    for (const cleanup of cleanups) cleanup();
    for (const agentId of observations.keys()) remove(agentId);
    await Promise.all(pendingWrites);
  };
}
