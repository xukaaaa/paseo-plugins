import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Text } from "react-native";
import type { Summary } from "../shared/contracts";
import { formatRate } from "../shared/format";

export function Footer({ item, theme }: PluginTimelineItemProps<Summary>) {
  const label = `⚡ ${formatRate(item.data.rate)}`;
  return (
    <Text
      accessibilityLabel={`Tốc độ sinh văn bản ước lượng: ${formatRate(item.data.rate)}, không tính thời gian chạy công cụ`}
      style={{ color: theme.colors.foregroundMuted, fontSize: 12, marginTop: 2, marginBottom: 8 }}
    >
      {label}
    </Text>
  );
}
