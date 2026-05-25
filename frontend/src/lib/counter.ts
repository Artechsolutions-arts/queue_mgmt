import type { Counter } from "@/lib/api";

// Operational state of a counter, derived from live data:
//   offline  — not active (staff took it offline)
//   serving  — a token is currently IN_PROGRESS at the counter
//   waiting  — active, nobody being served, but patients are queued
//   idle     — active, nobody being served, queue empty
//
// The "waiting" state is the fix for counters reading "idle" while patients
// wait: a queued counter is NOT idle, it's awaiting the next "Call Next".
export type CounterState = "offline" | "serving" | "waiting" | "idle";

export function counterState(c: Counter): CounterState {
  if (!c.is_active) return "offline";
  if (c.current_token) return "serving";
  const hasQueue = (c.queue_depth ?? 0) > 0 || (c.next_tokens?.length ?? 0) > 0;
  return hasQueue ? "waiting" : "idle";
}

export const COUNTER_STATE_LABEL: Record<CounterState, string> = {
  offline: "Offline",
  serving: "Serving",
  waiting: "Waiting",
  idle: "Idle",
};

// One-line operational summary for the counter cards.
export function counterStatusText(c: Counter): string {
  switch (counterState(c)) {
    case "offline":
      return "Offline";
    case "serving":
      return `Serving ${c.current_token}`;
    case "waiting": {
      const n = c.queue_depth ?? c.next_tokens?.length ?? 0;
      return `${n} waiting · not called yet`;
    }
    case "idle":
      return "Idle · ready to serve";
  }
}
