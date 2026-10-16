import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const phaseSchema = z.enum(["waiting", "thinking", "tools", "streaming", "unavailable"]);
export const liveSchema = z.object({
  agentId: z.string(),
  workspaceId: z.string().nullable(),
  phase: phaseSchema,
  rate: z.number().finite().nonnegative().nullable(),
});
export const liveRpc = defineRpc({
  name: "tps.live",
  input: z.object({}),
  output: z.array(liveSchema),
});

export const summarySchema = z.object({
  rate: z.number().finite().positive(),
  estimatedTokens: z.number().int().positive(),
  measuredTokens: z.number().int().positive(),
  activeMs: z.number().finite().positive(),
  tokenizer: z.literal("o200k_base"),
  estimated: z.literal(true),
  messageId: z.string().nullable(),
});
export type Phase = z.infer<typeof phaseSchema>;
export type Live = z.infer<typeof liveSchema>;
export type Summary = z.infer<typeof summarySchema>;
export const FOOTER_KIND = "response-tps";
