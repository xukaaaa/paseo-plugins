import type { PluginButtonIcon, PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { liveRpc } from "../shared/contracts";
import { liveLabel } from "../shared/format";

/** One in-flight RPC per app; no per-agent polling or client-side tokenization. */
export function contributeClient(
  client: PluginClientContext,
  lightningIcon: PluginButtonIcon = "Zap",
): () => void {
  const pills = new Map<string, { workspaceId: string; handle: PluginButtonRegistration }>();
  let stopped = false;
  let failed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    for (const { handle } of pills.values()) handle.remove();
    pills.clear();
  };
  const poll = async () => {
    try {
      const states = await client.rpc(liveRpc, {});
      if (stopped) return;
      failed = false;
      const active = new Set<string>();
      for (const state of states) {
        if (!state.workspaceId) continue;
        active.add(state.agentId);
        const label = liveLabel(state);
        const button = {
          title: `Tốc độ phản hồi ước lượng: ${label}`,
          label,
          icon: state.phase === "tools" ? "Wrench" : lightningIcon,
          // Keep the native composer-pill contrast instead of its dimmed disabled
          // style. The required action is a no-op: no panel or agent operation.
          disabled: false,
          behavior: { kind: "action" as const, onPress() {} },
        };
        let pill = pills.get(state.agentId);
        if (pill && pill.workspaceId !== state.workspaceId) {
          pill.handle.remove();
          pills.delete(state.agentId);
          pill = undefined;
        }
        if (pill) pill.handle.update(button);
        else pills.set(state.agentId, {
          workspaceId: state.workspaceId,
          handle: client.addComposerPill({
            id: "live-tps",
            workspaceId: state.workspaceId,
            agentId: state.agentId,
            button,
          }),
        });
      }
      for (const [agentId, { handle }] of pills) {
        if (!active.has(agentId)) {
          handle.remove();
          pills.delete(agentId);
        }
      }
    } catch (error) {
      if (stopped) return;
      clear(); // Never leave a stale rate visible after a disconnect.
      if (!failed) console.error("Không tải được tốc độ phản hồi", error);
      failed = true;
    } finally {
      if (!stopped) timer = setTimeout(() => { void poll(); }, failed ? 2_000 : 100);
    }
  };
  void poll();
  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    clear();
  };
}
