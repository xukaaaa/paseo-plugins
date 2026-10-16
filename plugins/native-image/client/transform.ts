import type { PluginTimelineItem } from "@getpaseo/plugin";
import { CAPTION_KIND, decodeCard, IMAGE_KIND } from "../shared/protocol";

/** Paseo 0.10 coalesces custom-message text with the preceding assistant row. */
export function transformImageMessage(text: string) {
  const items: PluginTimelineItem[] = [];
  let cursor = 0;
  let captions = 0;
  const caption = (value: string) => {
    if (value.trim()) items.push({ type: "plugin", id: `caption-${captions++}`, kind: CAPTION_KIND, version: 1, data: { text: value } });
  };
  for (const match of text.matchAll(/pi-native-image:v1 [^\n]*(?:\n|$)/g)) {
    const card = decodeCard(match[0]);
    if (!card) continue;
    caption(text.slice(cursor, match.index));
    items.push({ type: "plugin", id: card.id, kind: IMAGE_KIND, version: 1, data: card });
    cursor = match.index + match[0].length;
  }
  if (!items.length) return;
  caption(text.slice(cursor));
  return { items };
}
