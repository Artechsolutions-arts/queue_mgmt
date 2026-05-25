import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { motion } from "framer-motion";
import { Camera, ScanLine, AlertOctagon, Eye, Maximize2 } from "lucide-react";
import { ClientClock } from "@/components/ui/client-clock";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid } from "recharts";

export const Route = createFileRoute("/cctv")({
  head: () => ({ meta: [{ title: "CCTV AI Analytics · Helix OS" }, { name: "description", content: "Multi-camera AI surveillance and crowd analytics." }] }),
  component: CctvPage,
});

const CAMS = [
  { id: "CAM-01", name: "Main Entrance", density: 0.74, people: 38, tone: "warn", anomaly: false },
  { id: "CAM-02", name: "OPD Corridor", density: 0.58, people: 24, tone: "cyan", anomaly: false },
  { id: "CAM-03", name: "Radiology Hall", density: 0.92, people: 51, tone: "danger", anomaly: true },
  { id: "CAM-04", name: "ER Waiting", density: 0.31, people: 12, tone: "emerald", anomaly: false },
  { id: "CAM-05", name: "Pharmacy Queue", density: 0.61, people: 27, tone: "cyan", anomaly: false },
  { id: "CAM-06", name: "Billing Counter", density: 0.81, people: 36, tone: "warn", anomaly: true },
];

const toneColor: Record<string, string> = {
  warn: "var(--warn)",
  cyan: "var(--cyan-glow)",
  emerald: "var(--emerald-glow)",
  danger: "var(--danger)",
};

function CamTile({ cam }: { cam: (typeof CAMS)[number] }) {
  const color = toneColor[cam.tone];
  return (
    <motion.div whileHover={{ y: -3 }} className="group relative overflow-hidden rounded-xl border border-border/60 bg-accent" style={{ boxShadow: `0 0 0 1px color-mix(in oklab, ${color} 25%, transparent)` }}>
      {/* Fake feed */}
      <div className="relative aspect-video">
        <div className="absolute inset-0" style={{
          background: `radial-gradient(120% 80% at 30% 20%, color-mix(in oklab, ${color} 24%, transparent), transparent 60%), repeating-linear-gradient(0deg, oklch(0.18 0.02 260) 0 2px, oklch(0.14 0.02 260) 2px 4px)`,
        }} />
        {/* People dots */}
        {Array.from({ length: cam.people / 3 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute h-2 w-2 rounded-full"
            style={{ background: color, boxShadow: `0 0 6px ${color}`, left: `${(i * 37) % 90 + 5}%`, top: `${(i * 53) % 80 + 10}%` }}
            animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.3, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.1 }}
          />
        ))}
        {/* AI bounding boxes */}
        <div className="absolute left-[18%] top-[28%] h-12 w-10 rounded-sm border border-dashed" style={{ borderColor: color }} />
        <div className="absolute right-[22%] top-[40%] h-10 w-8 rounded-sm border border-dashed" style={{ borderColor: color }} />
        {/* Scan line */}
        <div className="scanline pointer-events-none absolute inset-0" />
        {/* HUD overlay */}
        <div className="absolute left-2 top-2 flex items-center gap-2 rounded-md bg-black/40 px-2 py-1 text-[10px] font-mono text-white backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--danger)] pulse-dot" /> REC · {cam.id}
        </div>
        <div className="absolute right-2 top-2 rounded-md bg-black/40 px-2 py-1 text-[10px] font-mono text-white backdrop-blur"><ClientClock /></div>
        <button className="absolute right-2 bottom-2 grid h-7 w-7 place-items-center rounded-md bg-black/40 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        {cam.anomaly && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-[var(--danger)]/20 px-2 py-1 text-[10px] font-semibold text-[var(--danger)] backdrop-blur ring-1 ring-[var(--danger)]/40">
            <AlertOctagon className="h-3 w-3" /> Anomaly
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-3 py-2.5">
        <div>
          <div className="text-xs font-semibold text-foreground">{cam.name}</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{cam.people} people · density {Math.round(cam.density * 100)}%</div>
        </div>
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full" style={{ width: `${cam.density * 100}%`, background: color, boxShadow: `0 0 8px ${color}` }} />
        </div>
      </div>
    </motion.div>
  );
}

const densityData = Array.from({ length: 30 }, (_, i) => ({ t: i, v: 30 + 35 * Math.sin(i / 4) + (i * 5) % 15 }));

function CctvPage() {
  return (
    <AppShell title="CCTV AI Analytics" subtitle="6 live feeds · YOLOv8 person detection · density forecasting">
      <div className="mb-4 rounded-md border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-3 py-2 text-xs text-[var(--warn)]">
        Mock data — the <code className="font-mono">vision-service</code> publishes detections to Redis but doesn't expose them via REST. Add a viewset over the <code className="font-mono">VisionMetric</code> model (or a Redis-backed endpoint) to wire this page.
      </div>
      <section className="grid grid-cols-12 gap-5">
        <Panel className="col-span-12 xl:col-span-9">
          <PanelHeader title="Live camera grid" subtitle="Crowd density + anomaly detection overlay" accent="cyan" action={
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <Eye className="h-3 w-3" /> 188 people detected · 2 anomalies
            </div>
          } />
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
            {CAMS.map((c) => <CamTile key={c.id} cam={c} />)}
          </div>
        </Panel>
        <Panel className="col-span-12 xl:col-span-3">
          <PanelHeader title="Anomaly stream" subtitle="Live AI alerts" accent="violet" />
          <div className="space-y-2 p-4">
            {[
              { c: "var(--danger)", t: "Radiology corridor density 92% — sustained 6m" },
              { c: "var(--warn)", t: "Billing queue length exceeded SLA by 1.4×" },
              { c: "var(--cyan-glow)", t: "Loitering detected · Reception (CAM-01)" },
              { c: "var(--violet-glow)", t: "Unattended item · Pharmacy (CAM-05)" },
              { c: "var(--warn)", t: "Wheelchair flow obstruction · Corridor B" },
            ].map((it, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className="flex items-start gap-2 rounded-lg border border-border/40 bg-muted/50 p-3">
                <ScanLine className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: it.c }} />
                <span className="text-[11px] leading-relaxed text-foreground/90">{it.t}</span>
              </motion.div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="mt-5 grid grid-cols-12 gap-5">
        <Panel className="col-span-12 xl:col-span-8">
          <PanelHeader title="Density forecast · all zones" subtitle="Predicted occupancy over next 60 min" accent="cyan" />
          <div className="h-[220px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={densityData}>
                <defs>
                  <linearGradient id="dg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.82 0.17 200)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.82 0.17 200)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="oklch(1 0 0 / 0.05)" vertical={false} />
                <XAxis dataKey="t" stroke="oklch(0.7 0.03 250)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="oklch(0.7 0.03 250)" fontSize={10} tickLine={false} axisLine={false} />
                <Area type="monotone" dataKey="v" stroke="oklch(0.82 0.17 200)" fill="url(#dg)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel className="col-span-12 xl:col-span-4">
          <PanelHeader title="Camera health" subtitle="6 online · 0 offline" accent="emerald" action={<Camera className="h-3.5 w-3.5 text-[var(--emerald-glow)]" />} />
          <div className="grid grid-cols-2 gap-3 p-5">
            {[
              { k: "Avg latency", v: "84ms", c: "var(--cyan-glow)" },
              { k: "FPS", v: "29.7", c: "var(--emerald-glow)" },
              { k: "Bandwidth", v: "412 Mb/s", c: "var(--violet-glow)" },
              { k: "Detections /s", v: "1,284", c: "var(--cyan-glow)" },
            ].map((m) => (
              <div key={m.k} className="rounded-lg border border-border/50 bg-muted/50 p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{m.k}</div>
                <div className="mt-1 font-mono text-lg font-semibold" style={{ color: m.c }}>{m.v}</div>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </AppShell>
  );
}