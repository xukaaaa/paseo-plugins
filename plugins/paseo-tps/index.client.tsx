import type { PluginClientContext } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { contributeClient } from "./client/contribute";
import { Footer } from "./client/footer";
import { createLightningIcon } from "./client/lightning";
import { FOOTER_KIND, summarySchema } from "./shared/contracts";

const LightningIcon = createLightningIcon(Icon);

export default function contribute(client: PluginClientContext) {
  const removeRenderer = client.addTimelineRenderer({
    kind: FOOTER_KIND,
    version: 1,
    schema: summarySchema,
    Component: Footer,
  });
  const stopLive = contributeClient(client, LightningIcon);
  return () => {
    stopLive();
    removeRenderer();
  };
}
