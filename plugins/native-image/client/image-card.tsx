import { useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useRpc, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { copyText } from "@getpaseo/plugin/client/react-native";
import { previewRpc } from "../shared/contracts";
import type { ImageCard as ImageCardData } from "../shared/protocol";

type Preview = { base64: string; mimeType: string; width: number; height: number };
export function ImageCard({ item, theme, layout }: PluginTimelineItemProps<ImageCardData>) {
  const loadPreview = useRpc(previewRpc);
  const card = item.data;
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const artifactId = card.artifact?.artifactId;
  const mimeType = card.artifact?.mimeType;

  useEffect(() => {
    let active = true;
    setPreview(undefined);
    setError(undefined);
    if (card.status === "completed" && artifactId && mimeType) {
      void loadPreview({ artifactId, mimeType }).then((result) => {
        if (active) setPreview(result);
      }).catch(() => {
        if (active) setError("Không tải được ảnh. File có thể đã bị xóa hoặc plugin mất kết nối.");
      });
    }
    return () => { active = false; };
  }, [artifactId, mimeType, card.status, attempt, loadPreview]);

  return (
    <View style={{ padding: 12, gap: 8, borderRadius: 10, backgroundColor: theme.colors.surface0 }}>
      <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>
        {card.status === "completed" ? "Ảnh vừa tạo" : "Tạo ảnh thất bại"}
      </Text>
      {card.status === "failed" ? (
        <Text style={{ color: theme.colors.foregroundMuted }}>{card.error || "Không có ảnh trả về."}</Text>
      ) : error ? (
        <>
          <Text style={{ color: theme.colors.foregroundMuted }}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)}>
            <Text style={{ color: theme.colors.foreground }}>Thử tải lại</Text>
          </Pressable>
        </>
      ) : preview ? (
        <Pressable accessibilityRole="button" accessibilityLabel={expanded ? "Thu nhỏ ảnh" : "Phóng to ảnh"} onPress={() => setExpanded((value) => !value)}>
          <Image
            accessibilityLabel="Ảnh được tạo bằng native image generation"
            source={{ uri: `data:${preview.mimeType};base64,${preview.base64}` }}
            resizeMode="contain"
            style={{ width: "100%", aspectRatio: preview.width / preview.height, maxHeight: expanded ? 1024 : layout.compact ? 320 : 480 }}
          />
        </Pressable>
      ) : (
        <Text style={{ color: theme.colors.foregroundMuted }}>Đang tải ảnh…</Text>
      )}
      {artifactId && <Pressable accessibilityRole="button" accessibilityLabel="Sao chép mã ảnh" onPress={() => { void copyText(artifactId).catch(() => {}); }}>
        <Text selectable style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>ID: {artifactId}</Text>
      </Pressable>}
    </View>
  );
}
