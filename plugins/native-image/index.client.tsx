import { Text } from "react-native";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { ImageCard } from "./client/image-card";
import { transformImageMessage } from "./client/transform";
import { CAPTION_KIND, captionSchema, IMAGE_KIND, imageCardSchema } from "./shared/protocol";

export default function contribute(client: PluginClientContext) {
  const removeRenderer = client.addTimelineRenderer({ kind: IMAGE_KIND, version: 1, schema: imageCardSchema, Component: ImageCard });
  const removeCaption = client.addTimelineRenderer({
    kind: CAPTION_KIND, version: 1, schema: captionSchema,
    Component: ({ item, theme }) => <Text selectable style={{ color: theme.colors.foreground }}>{item.data.text}</Text>,
  });
  const removeTransformer = client.addTimelineTransformer({
    id: "pi-native-image",
    query: { itemType: "assistant_message" },
    transform: ({ item }) => transformImageMessage(item.text),
  });
  return () => { removeTransformer(); removeCaption(); removeRenderer(); };
}
