import type { Counter } from "@/lib/api";

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

// Derive a zone/department from a counter's name + location.
export function counterZone(c: Counter): string {
  const hay = `${c.name} ${c.location_description ?? ""}`.toLowerCase();
  if (/cardio|ecg|echo|eeg/.test(hay))           return "Cardiology";
  if (/endoscop|biopsy/.test(hay))               return "Endoscopy";
  if (/radiolog|x-ray|imaging|mri|\bct\b|mammog|ultrasound/.test(hay)) return "Radiology";
  if (/\blab\b|patholog|blood|urine|pft/.test(hay)) return "Lab";
  if (/emergenc|\ber\b|trauma|casualty/.test(hay)) return "Emergency";
  if (/senses|ent|ophth|ear|nose|eye/.test(hay)) return "Senses";
  if (/dermatol|skin/.test(hay))                 return "Dermatology";
  if (/gynaecol|gynecol|women|maternity/.test(hay)) return "Gynaecology";
  if (/neurol/.test(hay))                        return "Neurology";
  if (/psychiat|mental/.test(hay))               return "Psychiatry";
  if (/dental|dent/.test(hay))                   return "Dental";
  if (/surg/.test(hay))                          return "Surgery";
  if (/paediatr|pediatr/.test(hay))              return "Paediatrics";
  return "OPD";
}

// Preferred display order for zone pills.
export const ZONE_ORDER = [
  "OPD", "Paediatrics", "Radiology", "Lab", "Cardiology",
  "Endoscopy", "Neurology", "Psychiatry", "Gynaecology",
  "Senses", "Dermatology", "Dental", "Surgery", "Emergency",
];

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
