import type { Live } from "./contracts";

const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
export function formatRate(rate: number): string {
  return `~${number.format(rate)} token/s`;
}
export function liveLabel(live: Pick<Live, "phase" | "rate">): string {
  switch (live.phase) {
    case "tools": return "Đang chạy công cụ · TPS tạm dừng";
    case "thinking": return "Đang suy nghĩ…";
    case "waiting": return "Đang chờ phản hồi…";
    case "unavailable": return "TPS không khả dụng";
    case "streaming": return live.rate === null ? "Đang đo tốc độ…" : formatRate(live.rate);
  }
}
