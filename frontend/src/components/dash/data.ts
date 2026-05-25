export const QUEUE_LANES = [
  { code: "OPD", name: "OPD General", counter: "Counters 1-6 · Ground floor", serving: "A-238", waiting: 42, avgWait: 8, trend: -12, tone: "cyan" as const, load: 0.78, ai: "Open Counter 4 — predicted to clear 18 patients in 12 minutes." },
  { code: "RAD", name: "Radiology", counter: "MRI · CT · X-Ray suites", serving: "R-072", waiting: 31, avgWait: 22, trend: 24, tone: "warn" as const, load: 0.92, ai: "Critical congestion in 45 min. Reroute 12 follow-up patients to next slot." },
  { code: "ER", name: "Emergency Triage", counter: "ER bays 1-4 · Level 1", serving: "E-019", waiting: 6, avgWait: 2, trend: -34, tone: "emerald" as const, load: 0.34, ai: "Triage cycle improved 42s. Maintain staffing through shift change." },
  { code: "LAB", name: "Pathology Lab", counter: "Sample collection 1-3", serving: "L-141", waiting: 18, avgWait: 11, trend: 6, tone: "violet" as const, load: 0.62 },
  { code: "PHA", name: "Pharmacy", counter: "Dispense windows 1-4", serving: "P-329", waiting: 24, avgWait: 5, trend: -8, tone: "cyan" as const, load: 0.55 },
  { code: "BIL", name: "Billing & Insurance", counter: "Counters 7-9", serving: "B-088", waiting: 36, avgWait: 14, trend: 18, tone: "warn" as const, load: 0.81, ai: "Insurance verification bottleneck — auto-route to Counter 8." },
];