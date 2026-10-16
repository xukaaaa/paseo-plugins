import { z } from "zod";

export const PREFIX = "pi-native-image:v1 ";
export const CUSTOM_TYPE = "pi-native-image";
export const IMAGE_KIND = "native-image";
export const CAPTION_KIND = "native-image-caption";
export const captionSchema = z.object({ text: z.string() }).strict();
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_BRIDGE_LENGTH = 8192;
export const artifactSchema = z.object({
  artifactId: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
}).strict();
export const imageCardSchema = z.object({
  id: z.string().min(1).max(256),
  status: z.enum(["completed", "failed"]),
  artifact: artifactSchema.optional(),
  error: z.string().max(1000).optional(),
}).strict().refine((card) => card.status !== "completed" || card.artifact !== undefined);
export type Artifact = z.infer<typeof artifactSchema>;
export type ImageCard = z.infer<typeof imageCardSchema>;

export function encodeCard(card: ImageCard): string {
  // The trailing newline keeps consecutive cards and subsequent text separable
  // when Paseo coalesces adjacent assistant-message chunks.
  return PREFIX + JSON.stringify(imageCardSchema.parse(card)) + "\n";
}

/** Only whole, bounded messages are claimed; ordinary assistant text is untouched. */
export function decodeCard(text: string): ImageCard | undefined {
  if (!text.startsWith(PREFIX) || text.length > MAX_BRIDGE_LENGTH) return;
  try {
    const parsed = imageCardSchema.safeParse(JSON.parse(text.slice(PREFIX.length)));
    if (parsed.success) return parsed.data;
  } catch { /* Incomplete streaming JSON or an unrelated message. */ }
}

export function artifactFilename(artifact: Artifact): string {
  const { artifactId, mimeType } = artifactSchema.parse(artifact);
  const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[mimeType];
  return `${artifactId}.${extension}`;
}
