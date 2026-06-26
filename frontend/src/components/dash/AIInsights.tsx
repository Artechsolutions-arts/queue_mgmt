import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, ChevronRight, Bell } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function AIInsights() {
  const queryClient = useQueryClient();
  const { data: alerts = [] } = useQuery({
    queryKey: ["alerts"],
    queryFn: api.alerts,
    refetchInterval: 30_000,
  });

  const acknowledge = useMutation({
    mutationFn: api.acknowledgeAlert,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });

  if (alerts.length === 0) {
    return (
      <div className="flex h-36 flex-col items-center justify-center gap-2 text-muted-foreground">
        <CheckCircle2 className="h-6 w-6 text-[var(--emerald-glow)]" />
        <span className="text-sm">All queues within normal thresholds</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-5">
      {alerts.map((alert, i) => {
        const isDepth = alert.threshold_type === "QUEUE_DEPTH";
        const color = isDepth ? "var(--warn)" : "var(--danger)";
        return (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08, duration: 0.5 }}
            className="group relative overflow-hidden rounded-xl border border-border/60 bg-muted/70 p-4"
          >
            <div className="absolute inset-y-0 left-0 w-1" style={{ background: color, boxShadow: `0 0 12px ${color}` }} />
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}>
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="text-base font-semibold text-foreground">{alert.rule_name}</h4>
                  {alert.service_type_name && (
                    <span className="shrink-0 rounded-md bg-muted/60 px-1.5 py-0.5 text-[12px] font-medium text-muted-foreground">{alert.service_type_name}</span>
                  )}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{alert.message}</p>
                <button
                  onClick={() => acknowledge.mutate(alert.id)}
                  className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold transition-colors"
                  style={{ color }}
                >
                  Dismiss <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
