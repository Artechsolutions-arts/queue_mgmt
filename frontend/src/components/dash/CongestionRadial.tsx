import { RadialBar, RadialBarChart, ResponsiveContainer, PolarAngleAxis } from "recharts";

export function CongestionRadial({ score = 64 }: { score?: number }) {
  const data = [{ name: "score", value: score, fill: "url(#radial)" }];
  return (
    <div className="relative h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart cx="50%" cy="50%" innerRadius="72%" outerRadius="100%" barSize={14} data={data} startAngle={210} endAngle={-30}>
          <defs>
            <linearGradient id="radial" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="oklch(0.78 0.18 160)" />
              <stop offset="50%" stopColor="oklch(0.82 0.17 200)" />
              <stop offset="100%" stopColor="oklch(0.68 0.22 295)" />
            </linearGradient>
          </defs>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={8} background={{ fill: "oklch(1 0 0 / 0.06)" }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Risk Index</div>
        <div className="mt-1 text-4xl font-semibold tabular-nums text-foreground">{score}</div>
        <div className="text-[11px] font-medium text-[var(--cyan-glow)]">Moderate</div>
      </div>
    </div>
  );
}