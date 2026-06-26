import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMemo } from "react";

function hourLabel(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:00`;
}

export function ThroughputChart() {
  const { data: tokens = [] } = useQuery({
    queryKey: ["tokens-all"],
    queryFn: () => api.tokens(),
    refetchInterval: 30_000,
  });

  const chartData = useMemo(() => {
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const buckets: Record<string, { served: number; arrivals: number }> = {};
    for (const t of tokens) {
      if (!t.created_at.startsWith(todayPrefix)) continue;
      const label = hourLabel(t.created_at);
      if (!buckets[label]) buckets[label] = { served: 0, arrivals: 0 };
      buckets[label].arrivals += 1;
      if (t.status === "COMPLETED") buckets[label].served += 1;
    }
    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([t, v]) => ({ t, ...v }));
  }, [tokens]);

  if (chartData.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        No token data yet
      </div>
    );
  }

  return (
    <div className="h-[260px] w-full p-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="g-served" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.82 0.17 200)" stopOpacity={0.55} />
              <stop offset="100%" stopColor="oklch(0.82 0.17 200)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="g-arr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.68 0.22 295)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="oklch(0.68 0.22 295)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="oklch(1 0 0 / 0.05)" vertical={false} />
          <XAxis dataKey="t" stroke="oklch(0.48 0.02 250)" fontSize={12} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis stroke="oklch(0.48 0.02 250)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 13,
              color: "var(--foreground)",
            }}
            cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
          />
          <Area type="monotone" dataKey="arrivals" name="Registered" stroke="oklch(0.68 0.22 295)" fill="url(#g-arr)" strokeWidth={2} />
          <Area type="monotone" dataKey="served" name="Completed" stroke="oklch(0.82 0.17 200)" fill="url(#g-served)" strokeWidth={2.5} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
