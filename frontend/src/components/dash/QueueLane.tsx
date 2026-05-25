import { motion } from "framer-motion";
import { Sparkles, Users, Timer } from "lucide-react";

type Lane = {
  code: string;
  name: string;
  counter: string;
  serving: string;
  waiting: number;
  avgWait: number;
  trend: number;
  tone: "cyan" | "violet" | "emerald" | "warn";
  load: number;
  ai?: string;
};

const toneColor: Record<Lane["tone"], string> = {
  cyan: "var(--cyan-glow)",
  violet: "var(--violet-glow)",
  emerald: "var(--emerald-glow)",
  warn: "var(--warn)",
};

export function QueueLane({ lane }: { lane: Lane }) {
  const color = toneColor[lane.tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.5 }}
      className="group relative overflow-hidden rounded-2xl glass p-5"
      style={{ boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 22%, transparent)` }}
    >
      <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full opacity-30 blur-3xl" style={{ background: color }} />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl font-mono text-sm font-bold" style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}>
            {lane.code}
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">{lane.name}</div>
            <div className="text-[11px] text-muted-foreground">{lane.counter}</div>
          </div>
        </div>
        <div className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ background: `color-mix(in oklab, ${color} 14%, transparent)`, color }}>
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full pulse-dot align-middle" style={{ background: color }} />
          Active
        </div>
      </div>
      <div className="relative mt-4 flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Now Serving</div>
          <motion.div key={lane.serving} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="font-mono text-3xl font-bold tracking-tight text-foreground" style={{ textShadow: `0 0 24px ${color}` }}>
            {lane.serving}
          </motion.div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Trend</div>
          <div className="text-sm font-semibold" style={{ color: lane.trend >= 0 ? "var(--emerald-glow)" : "var(--danger)" }}>
            {lane.trend >= 0 ? "▲" : "▼"} {Math.abs(lane.trend)}%
          </div>
        </div>
      </div>
      <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
        <motion.div initial={{ width: 0 }} animate={{ width: `${lane.load * 100}%` }} transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }} className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${color}, oklch(0.7 0.22 255))`, boxShadow: `0 0 12px ${color}` }} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat icon={Users} label="Waiting" value={`${lane.waiting}`} />
        <Stat icon={Timer} label="Avg wait" value={`${lane.avgWait}m`} />
      </div>
      {lane.ai && (
        <div className="relative mt-4 flex items-start gap-2 rounded-lg border border-[oklch(0.82_0.17_200_/_0.25)] bg-[oklch(0.82_0.17_200_/_0.06)] p-2.5">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--cyan-glow)]" />
          <p className="text-[11px] leading-relaxed text-foreground/85">{lane.ai}</p>
        </div>
      )}
    </motion.div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/50 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-0.5 font-mono text-base font-semibold text-foreground tabular-nums">{value}</div>
    </div>
  );
}