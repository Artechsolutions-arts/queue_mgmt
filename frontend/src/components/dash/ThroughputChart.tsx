import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data = Array.from({ length: 24 }, (_, i) => ({
  t: `${String(i).padStart(2, "0")}:00`,
  served: Math.round(30 + 40 * Math.sin(i / 3) + (i * 7) % 18),
  arrivals: Math.round(28 + 38 * Math.sin(i / 3 + 0.5) + (i * 11) % 22),
  predicted: Math.round(34 + 42 * Math.sin(i / 3 + 0.2) + (i * 5) % 10),
}));

export function ThroughputChart() {
  return (
    <div className="h-[260px] w-full p-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="g-served" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.82 0.17 200)" stopOpacity={0.55} />
              <stop offset="100%" stopColor="oklch(0.82 0.17 200)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="g-arr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.68 0.22 295)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="oklch(0.68 0.22 295)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="g-pred" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.78 0.18 160)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="oklch(0.78 0.18 160)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="oklch(1 0 0 / 0.05)" vertical={false} />
          <XAxis dataKey="t" stroke="oklch(0.48 0.02 250)" fontSize={10} tickLine={false} axisLine={false} interval={2} />
          <YAxis stroke="oklch(0.48 0.02 250)" fontSize={10} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              background: "oklch(1 0 0)",
              border: "1px solid oklch(0.91 0.008 240)",
              borderRadius: 8,
              fontSize: 12,
              color: "oklch(0.2 0.02 250)",
              boxShadow: "0 8px 24px -12px oklch(0.2 0.02 250 / 0.18)",
            }}
          />
          <Area type="monotone" dataKey="predicted" stroke="oklch(0.78 0.18 160)" strokeDasharray="4 3" fill="url(#g-pred)" strokeWidth={1.5} />
          <Area type="monotone" dataKey="arrivals" stroke="oklch(0.68 0.22 295)" fill="url(#g-arr)" strokeWidth={2} />
          <Area type="monotone" dataKey="served" stroke="oklch(0.82 0.17 200)" fill="url(#g-served)" strokeWidth={2.5} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}