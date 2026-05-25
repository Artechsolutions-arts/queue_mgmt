import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { Activity, MessageSquare, ShieldAlert, UserCheck, Cpu } from "lucide-react";

const SEED = [
  { icon: UserCheck, color: "var(--emerald-glow)", text: "Token A-238 served at Counter 3 — 2m 14s wait" },
  { icon: MessageSquare, color: "var(--cyan-glow)", text: "WhatsApp delivered to 12 patients (batch #4421)" },
  { icon: ShieldAlert, color: "var(--warn)", text: "Anomaly: Radiology corridor density 92%" },
  { icon: Cpu, color: "var(--violet-glow)", text: "Forecast model v2.4.1 retrained — MAE 0.84" },
  { icon: Activity, color: "var(--cyan-glow)", text: "Counter R-4 opened — 18 patients rerouted" },
  { icon: UserCheck, color: "var(--emerald-glow)", text: "OPD token B-104 closed — 4m 02s" },
  { icon: MessageSquare, color: "var(--cyan-glow)", text: "SMS fallback engaged for 3 unreachable patients" },
];

// Deterministic SSR label; client effect swaps in real time.
const STATIC_LABELS = ["NOW", "12s ago", "24s ago", "36s ago", "48s ago"];
function fmt(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export function EventFeed() {
  const [items, setItems] = useState(() =>
    SEED.slice(0, 5).map((e, i) => ({ ...e, id: i, ts: 0, label: STATIC_LABELS[i] })),
  );
  const [seq, setSeq] = useState(100);
  useEffect(() => {
    // Initialize timestamps on the client only to avoid hydration mismatch.
    setItems((prev) => prev.map((it, i) => ({ ...it, ts: Date.now() - i * 12000, label: fmt(Date.now() - i * 12000) })));
    const t = setInterval(() => {
      setSeq((s) => s + 1);
      setItems((prev) => {
        const pick = SEED[(prev.length + prev[0]?.id) % SEED.length] ?? SEED[0];
        const ts = Date.now();
        return [{ ...pick, id: seq + 1, ts, label: fmt(ts) }, ...prev].slice(0, 7);
      });
    }, 3200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="flex flex-col gap-2 p-4">
      <AnimatePresence initial={false}>
        {items.map((it) => (
          <motion.div
            key={it.id}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.35 }}
            className="flex items-start gap-3 rounded-lg border border-border/40 bg-muted/50 p-3"
          >
            <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md" style={{ background: `color-mix(in oklab, ${it.color} 16%, transparent)`, color: it.color }}>
              <it.icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-foreground">{it.text}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">{it.label}</p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}