import { countTokens } from "gpt-tokenizer/encoding/o200k_base";
import type { AgentStreamEvent } from "@getpaseo/protocol/agent-types";
import type { Phase, Summary } from "../shared/contracts";

type Point = { at: number; offset: number };
type Segment = { points: Point[] };
type Response = { id: string | null; text: string; segments: Segment[] };

// Count ordinary text literally, including strings resembling tokenizer control tokens.
function tokens(text: string): number {
  return countTokens(text, { disallowedSpecial: new Set<string>() });
}

/** Uses arrival intervals, never wall-clock time spent waiting or executing tools.
 * The first chunk of each segment is excluded: its generation time is unknowable.
 * Token counts are a model-independent proxy, NOT provider-reported usage.
 */
export class Meter {
  phase: Phase = "waiting";
  private current: Response | undefined;
  private segment: Segment | undefined;
  private tools = new Set<string>();
  private cache: { response: Response; at: number; rate: number | null } | undefined;
  private invalid = false;

  accept(event: AgentStreamEvent, at: number): void {
    if (this.invalid || event.type !== "timeline") return;
    const item = event.item;
    if (item.type === "assistant_message" && item.text) {
      const id = item.messageId ?? null;
      if (!this.current || this.current.id !== id) {
        this.current = { id, text: "", segments: [] };
        this.segment = undefined;
      }
      this.current.text += item.text;
      const point = { at, offset: this.current.text.length };
      if (!this.segment) {
        this.segment = { points: [point] };
        this.current.segments.push(this.segment);
      } else {
        this.segment.points.push(point);
      }
      this.phase = "streaming";
      this.cache = undefined;
    } else if (item.type === "tool_call") {
      if (item.status === "running") {
        const isNewCall = !this.tools.has(item.callId);
        this.tools.add(item.callId);
        if (isNewCall) {
          this.segment = undefined;
          this.phase = "tools";
        }
      } else {
        this.tools.delete(item.callId);
        if (this.phase === "tools" && this.tools.size === 0) this.phase = "waiting";
      }
    } else if (item.type === "reasoning") {
      this.segment = undefined;
      this.phase = "thinking";
    } else if (item.type === "compaction" && item.status === "loading") {
      this.segment = undefined;
      this.phase = "waiting";
    }
  }

  invalidate(): void {
    // Never present a final result after an observation gap or a history replacement.
    this.invalid = true;
    this.segment = undefined;
    this.phase = "unavailable";
  }

  liveState(at: number): { phase: Phase; rate: number | null } {
    const points = this.segment?.points;
    const last = points?.[points.length - 1];
    if (this.phase === "streaming" && last && at - last.at > 2_000) {
      return { phase: this.tools.size ? "tools" : "waiting", rate: null };
    }
    return { phase: this.phase, rate: this.liveRate() };
  }

  liveRate(): number | null {
    const response = this.current;
    const points = this.segment?.points;
    if (this.phase !== "streaming" || !response || !points || points.length < 2) return null;
    const last = points[points.length - 1]!;
    if (this.cache?.response === response && this.cache.at === last.at) return this.cache.rate;
    // Retain the sample just before the three-second window as the baseline.
    let start = 0;
    while (start + 1 < points.length - 1 && points[start + 1]!.at < last.at - 3_000) start++;
    const first = points[start]!;
    const elapsed = last.at - first.at;
    // A short live warmup keeps the indicator responsive. Completed summaries
    // retain their separate 500 ms threshold to avoid saving unstable samples.
    const generated = elapsed >= 100
      ? tokens(response.text.slice(first.offset, last.offset))
      : 0;
    const rate = generated > 0 ? generated * 1_000 / elapsed : null;
    this.cache = { response, at: last.at, rate };
    return rate;
  }

  summary(): Summary | null {
    if (this.invalid) return null;
    // The canonical footer belongs to the last visible response, not hidden thinking
    // or assistant messages preceding tools earlier in the turn.
    const response = this.current;
    if (!response) return null;
    let activeMs = 0;
    let measuredTokens = 0;
    for (const { points } of response.segments) {
      const first = points[0]!;
      const last = points[points.length - 1]!;
      if (last.at <= first.at) continue;
      activeMs += last.at - first.at;
      measuredTokens += tokens(response.text.slice(first.offset, last.offset));
    }
    if (activeMs < 500 || measuredTokens === 0) return null;
    return {
      rate: measuredTokens * 1_000 / activeMs,
      estimatedTokens: tokens(response.text),
      measuredTokens,
      activeMs,
      tokenizer: "o200k_base",
      estimated: true,
      messageId: response.id,
    };
  }
}
