import { motion } from "framer-motion";
import { Sparkles, AlertTriangle, Route, TrendingUp, ChevronRight } from "lucide-react";

const insights = [
  { icon: AlertTriangle, tone: "warn", title: "Congestion expected in Radiology", body: "Predicted +37% load within 45 min. Suggest opening Counter R-4 & redirect 18 patients.", confidence: 92, action: "Apply rerouting" },
  { icon: Route, tone: "cyan", title: "Reroute 12 OPD patients → Counter 4", body: "Counter 4 idle 6 min, current wait 1.8 min. Saves est. 14 min queue time.", confidence: 87, action: "Auto-apply" },
  { icon: TrendingUp, tone: "emerald", title: "ER throughput trending +18%", body: "Triage cycle improved by 42s avg. Maintain current staffing through 18:00.", confidence: 81, action: "Acknowledge" },
  { icon: Sparkles, tone: "violet", title: "Schedule predictive call-aheads", body: "WhatsApp 24 patients with shifted slot. 88% historic acceptance rate.", confidence: 79, action: "Send batch" },
];

const toneColor: Record<string, string> = {
  warn: "var(--warn)",
  cyan: "var(--cyan-glow)",
  emerald: "var(--emerald-glow)",
  violet: "var(--violet-glow)",
};

export function AIInsights() {
  return (
    <div className="flex flex-col gap-3 p-5">
      {insights.map((it, i) => {
        const color = toneColor[it.tone];
        return (
          <motion.div
            key={it.title}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08, duration: 0.5 }}
            className="group relative overflow-hidden rounded-xl border border-border/60 bg-muted/70 p-4 transition-all hover:border-[color:var(--cyan-glow)]/40"
          >
            <div className="absolute inset-y-0 left-0 w-1" style={{ background: color, boxShadow: `0 0 12px ${color}` }} />
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}>
                <it.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-foreground">{it.title}</h4>
                  <span className="shrink-0 rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{it.confidence}% conf.</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{it.body}</p>
                <button className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold transition-colors" style={{ color }}>
                  {it.action} <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}