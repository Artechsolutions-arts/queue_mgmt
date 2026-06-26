import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Activity, MessageSquare, UserCheck, CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/lib/api";

function fmt(ts: string) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const STATUS_META = {
  COMPLETED: { icon: CheckCircle2, color: "var(--emerald-glow)", label: "Completed" },
  IN_PROGRESS: { icon: Activity, color: "var(--cyan-glow)", label: "Called" },
  NO_SHOW:  { icon: XCircle, color: "var(--warn)", label: "No-show" },
  WAITING:  { icon: UserCheck, color: "var(--violet-glow)", label: "Registered" },
  CANCELLED:{ icon: XCircle, color: "var(--danger)", label: "Cancelled" },
};

function eventTime(t: { status: string; created_at: string; service_start_at: string | null; completed_at: string | null }): string {
  if ((t.status === "COMPLETED" || t.status === "NO_SHOW" || t.status === "CANCELLED") && t.completed_at) return t.completed_at;
  if (t.status === "IN_PROGRESS" && t.service_start_at) return t.service_start_at;
  return t.created_at;
}

export function EventFeed() {
  const { data: tokens = [] } = useQuery({
    queryKey: ["tokens-all"],
    queryFn: () => api.tokens(),
    refetchInterval: 10_000,
    select: (all) =>
      [...all]
        .sort((a, b) => new Date(eventTime(b)).getTime() - new Date(eventTime(a)).getTime())
        .slice(0, 8),
  });

  if (tokens.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground p-4">
        No recent activity
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      <AnimatePresence initial={false}>
        {tokens.map((t) => {
          const meta = STATUS_META[t.status] ?? STATUS_META.WAITING;
          const Icon = meta.icon;
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.35 }}
              className="flex items-start gap-3 rounded-lg border border-border/40 bg-muted/50 p-3"
            >
              <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md" style={{ background: `color-mix(in oklab, ${meta.color} 16%, transparent)`, color: meta.color }}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  <span className="font-mono font-semibold">{t.number}</span>
                  {" · "}{t.patient_name}
                  {t.service_type_name ? ` · ${t.service_type_name}` : ""}
                  {t.counter_name ? ` → ${t.counter_name}` : ""}
                </p>
                <p className="mt-0.5 text-[12px] uppercase tracking-widest text-muted-foreground">
                  {meta.label} · {fmt(eventTime(t))}
                </p>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
