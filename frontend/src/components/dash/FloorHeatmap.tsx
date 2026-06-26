import { motion } from "framer-motion";
import { useMemo } from "react";
import { useCounters } from "@/hooks/use-queue-data";
import { counterZone } from "@/lib/counter";

const ZONE_LAYOUT: Record<string, { x: number; y: number; w: number; h: number }> = {
  Radiology:    { x: 8,  y: 14, w: 22, h: 18 },
  Emergency:    { x: 32, y: 8,  w: 28, h: 22 },
  OPD:          { x: 62, y: 12, w: 30, h: 26 },
  Lab:          { x: 10, y: 36, w: 18, h: 16 },
  Cardiology:   { x: 30, y: 36, w: 16, h: 14 },
  Gynaecology:  { x: 48, y: 34, w: 14, h: 12 },
  Paediatrics:  { x: 64, y: 38, w: 14, h: 12 },
  Neurology:    { x: 8,  y: 56, w: 14, h: 13 },
  Psychiatry:   { x: 24, y: 56, w: 14, h: 13 },
  Dental:       { x: 40, y: 56, w: 12, h: 13 },
  Senses:       { x: 54, y: 52, w: 14, h: 13 },
  Dermatology:  { x: 70, y: 54, w: 12, h: 13 },
  Surgery:      { x: 80, y: 36, w: 12, h: 16 },
  Endoscopy:    { x: 82, y: 56, w: 12, h: 12 },
};

function loadColor(l: number) {
  if (l >= 0.8) return "oklch(0.68 0.24 20)";
  if (l >= 0.6) return "oklch(0.82 0.17 75)";
  if (l >= 0.4) return "oklch(0.82 0.17 200)";
  return "oklch(0.78 0.18 160)";
}

export function FloorHeatmap() {
  const { data: counters = [] } = useCounters();

  const zones = useMemo(() => {
    const byZone = new Map<string, { depth: number; total: number }>();
    for (const c of counters) {
      const z = counterZone(c);
      const prev = byZone.get(z) ?? { depth: 0, total: 0 };
      byZone.set(z, { depth: prev.depth + (c.queue_depth ?? 0), total: prev.total + 1 });
    }
    return Array.from(byZone.entries())
      .filter(([z]) => ZONE_LAYOUT[z])
      .map(([name, { depth, total }]) => {
        const maxDepth = total * 10;
        return { name, load: Math.min(depth / maxDepth, 1), ...ZONE_LAYOUT[name] };
      });
  }, [counters]);

  const flow = useMemo(() => Array.from({ length: 18 }, (_, i) => ({ id: i, delay: i * 0.18 })), []);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-border/50 bg-accent/40">
      <div className="absolute inset-0 grid-bg opacity-50" />
      {zones.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">No counter data</div>
      )}
      <svg viewBox="0 0 100 80" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id="zone-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        {zones.map((z) => {
          const color = loadColor(z.load);
          return (
            <g key={z.name} style={{ color }}>
              <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="1.2" fill="url(#zone-glow)" stroke={color} strokeOpacity={0.6} strokeWidth={0.25} />
              <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="1.2" fill={color} fillOpacity={z.load * 0.35} />
              <text x={z.x + 1.2} y={z.y + 3.5} fontSize="2" fill="oklch(0.95 0.01 240)" opacity="0.85">{z.name}</text>
              <text x={z.x + 1.2} y={z.y + z.h - 1.2} fontSize="1.8" fontWeight="700" fill={color}>{Math.round(z.load * 100)}%</text>
            </g>
          );
        })}
        <path d="M 14 70 Q 30 50, 50 40 T 90 18" stroke="oklch(0.82 0.17 200)" strokeWidth="0.25" strokeDasharray="1 1" fill="none" opacity="0.6" />
        <path d="M 24 70 Q 40 60, 60 50 T 84 28" stroke="oklch(0.68 0.22 295)" strokeWidth="0.25" strokeDasharray="1 1" fill="none" opacity="0.6" />
      </svg>
      {flow.map((f) => (
        <motion.div
          key={f.id}
          className="absolute h-1.5 w-1.5 rounded-full"
          style={{
            background: f.id % 3 === 0 ? "var(--violet-glow)" : f.id % 2 === 0 ? "var(--cyan-glow)" : "var(--emerald-glow)",
            boxShadow: "0 0 8px currentColor",
            top: "60%",
            left: "10%",
          }}
          animate={{ top: ["60%", "30%", "20%"], left: ["10%", "55%", `${85 + (f.id % 5)}%`], opacity: [0, 1, 0] }}
          transition={{ duration: 6 + (f.id % 4), repeat: Infinity, delay: f.delay, ease: "easeInOut" }}
        />
      ))}
      <div className="scanline pointer-events-none absolute inset-0" />
      <div className="absolute bottom-3 right-3 flex items-center gap-3 rounded-lg border border-border/60 bg-muted/70 px-3 py-2 text-[12px] text-muted-foreground backdrop-blur">
        {[
          { l: "Low", c: "var(--emerald-glow)" },
          { l: "Moderate", c: "var(--cyan-glow)" },
          { l: "High", c: "var(--warn)" },
          { l: "Critical", c: "var(--danger)" },
        ].map((x) => (
          <div key={x.l} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: x.c, boxShadow: `0 0 6px ${x.c}` }} />
            {x.l}
          </div>
        ))}
      </div>
    </div>
  );
}
