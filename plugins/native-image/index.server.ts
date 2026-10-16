import type { PluginServerContext } from "@getpaseo/plugin/server";
import { previewRpc } from "./shared/contracts";
import { createPreview } from "./server/preview";

export default function contribute(server: PluginServerContext) {
  server.handle(previewRpc, async (artifact) => createPreview(artifact));
  return () => {};
}
