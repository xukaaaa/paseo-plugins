import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { artifactSchema } from "./protocol";

export const previewRpc = defineRpc({
  name: "native-image.preview",
  input: artifactSchema,
  output: z.object({
    base64: z.string().max(2 * 1024 * 1024),
    mimeType: z.enum(["image/jpeg", "image/webp"]),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
});
