import { createFileRoute, Link } from "@tanstack/react-router";
import { useTheme } from "@/lib/theme";
import { Users, Clock, UserCheck, TrendingUp, Play, CheckCircle2, UserX, Power, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { KpiCard } from "@/components/dash/KpiCard";
import {
  useCounters,
  useDashboard,
  useQueueMutations,
  useTokens,
} from "@/hooks/use-queue-data";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Counter, Token } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api";
import { counterState, COUNTER_STATE_LABEL, type CounterState } from "@/lib/counter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Command Center · SmartQueue" },
      { name: "description", content: "Real-time queue operations command center." },
    ],
  }),
  component: Index,
});

function Index() {
  const { data: stats, isError } = useDashboard();
  const { data: counters } = useCounters();
  const { data: inProgress } = useTokens("IN_PROGRESS");
  const queryClient = useQueryClient();
  const { data: alerts = [] } = useQuery({ queryKey: ["alerts"], queryFn: api.alerts, refetchInterval: 30_000 });
  const acknowledge = useMutation({
    mutationFn: api.acknowledgeAlert,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const inProgressByCounter = useMemo(() => {
    const m = new Map<number, Token>();
    (inProgress ?? []).forEach((t) => {
      if (t.counter != null) m.set(t.counter, t);
    });
    return m;
  }, [inProgress]);

  const subtitle = isError
    ? "Backend unreachable"
    : stats
      ? `${stats.avg_service_minutes.toFixed(1)}m avg service · ${stats.completed_in_window} completed / ${stats.window_hours}h`
      : "Loading station performance…";

  return (
    <AppShell title="Command Center" subtitle={subtitle}>
      {alerts.length > 0 && (
        <section className="mb-5 flex flex-col gap-2">
          {alerts.map((alert) => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-3 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-semibold text-orange-600">{alert.rule_name}</span>
                <span className="ml-2 text-sm text-orange-500/80">{alert.message}</span>
              </div>
              <button
                onClick={() => acknowledge.mutate(alert.id)}
                className="shrink-0 rounded-lg border border-orange-500/30 px-2.5 py-1 text-[12px] font-medium text-orange-600 transition hover:bg-orange-500/10"
              >
                Dismiss
              </button>
            </motion.div>
          ))}
        </section>
      )}
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          to="/queues"
          tone="cyan"
          icon={Users}
          label="Patients Waiting"
          value={fmt(stats?.total_waiting)}
          delta={stats ? `${stats.total_in_progress} in progress` : null}
          deltaTone="muted"
          status={stats ? `${stats.total_waiting} in queue right now` : "Waiting for backend"}
        />
        <KpiCard
          to="/queues"
          tone="violet"
          icon={UserCheck}
          label="Active Counters"
          value={stats ? `${stats.active_counters} / ${stats.total_counters}` : "—"}
          delta={stats && stats.total_counters ? `${Math.round((stats.active_counters / stats.total_counters) * 100)}% online` : null}
          deltaTone="violet"
          status={stats && stats.active_counters === stats.total_counters ? "All counters are active" : "Some counters offline"}
        />
        <KpiCard
          to="/system"
          tone="emerald"
          icon={Clock}
          label="Avg Wait Time"
          value={fmt(stats?.avg_wait_minutes, 1)}
          unit="min"
          delta={stats ? `window ${stats.window_hours}h` : null}
          deltaTone="good"
          status={stats && stats.avg_wait_minutes < 10 ? "Improving wait times" : stats ? "Higher than target" : "—"}
        />
        <KpiCard
          to="/system"
          tone="warn"
          icon={TrendingUp}
          label="Completed (window)"
          value={fmt(stats?.completed_in_window)}
          delta={stats ? `avg svc ${fmt(stats.avg_service_minutes, 1)} min` : null}
          deltaTone="warn"
          status={stats && stats.completed_in_window > 0 ? `${stats.completed_in_window} served in last ${stats.window_hours}h` : "No completions yet"}
        />
      </section>

      <section className="mt-5">
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Service Counter Matrix"
            subtitle="Station performance · live queue depth · routing actions"
            accent="cyan"
          />
          <CounterMatrix counters={counters ?? []} inProgressByCounter={inProgressByCounter} />
        </Panel>
      </section>
    </AppShell>
  );
}

function CounterMatrix({
  counters,
  inProgressByCounter,
}: {
  counters: Counter[];
  inProgressByCounter: Map<number, Token>;
}) {
  const { callNext, complete, noShow, setCounterActive } = useQueueMutations();

  if (counters.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-base text-white">
        No counters configured. Start the backend and seed counters to populate this matrix.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-base">
        <thead>
          <tr className="text-[15px] uppercase tracking-widest text-white">
            <th className="px-5 py-3 font-medium">Station</th>
            <th className="px-5 py-3 font-medium">Current Category</th>
            <th className="px-5 py-3 font-medium">Token in Service</th>
            <th className="px-5 py-3 font-medium">Queue Depth</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3 font-medium">Routing Actions</th>
          </tr>
        </thead>
        <tbody>
          {counters.map((c) => {
            const token = inProgressByCounter.get(c.id) ?? null;
            const tokenLabel = token?.number ?? c.current_token ?? null;
            const category = token?.service_type_name ?? "—";
            const hasWaiting = (c.next_tokens?.length ?? 0) > 0;
            const callDisabled = !c.is_active || !hasWaiting || !!tokenLabel || callNext.isPending;
            const completeDisabled = !token || complete.isPending;
            const absentDisabled = !token || noShow.isPending;

            return (
              <tr key={c.id} className="border-t border-border/40 transition-colors hover:bg-[var(--cyan-glow)]/5">
                <td className="px-5 py-3 font-semibold text-white">
                  <Link to="/staff" className="hover:text-[var(--cyan-glow)] hover:underline underline-offset-4">
                    {c.name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-white">{category}</td>
                <td className="px-5 py-3">
                  {tokenLabel ? (
                    <span className="font-mono text-white">{tokenLabel}</span>
                  ) : (
                    <span className="font-mono text-white">—</span>
                  )}
                </td>
                <td className="px-5 py-3 font-mono tabular-nums text-white">
                  {c.queue_depth} <span className="text-white">waiting</span>
                </td>
                <td className="px-5 py-3">
                  <StatusBadge state={counterState(c)} />
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <ActionBtn
                      icon={Play}
                      label="Call Next"
                      tone="cyan"
                      disabled={callDisabled}
                      pending={callNext.isPending && callNext.variables === c.id}
                      onClick={() => callNext.mutate(c.id)}
                    />
                    <ActionBtn
                      icon={CheckCircle2}
                      label="Complete"
                      tone="emerald"
                      disabled={completeDisabled}
                      pending={complete.isPending && complete.variables === token?.number}
                      onClick={() => token && complete.mutate(token.number)}
                    />
                    <ActionBtn
                      icon={UserX}
                      label="Absent"
                      tone="warn"
                      disabled={absentDisabled}
                      pending={noShow.isPending && noShow.variables === token?.number}
                      onClick={() => token && noShow.mutate(token.number)}
                    />
                    <ActionBtn
                      icon={Power}
                      label={c.is_active ? "Offline" : "Online"}
                      tone="muted"
                      disabled={setCounterActive.isPending}
                      pending={setCounterActive.isPending && setCounterActive.variables?.id === c.id}
                      onClick={() => setCounterActive.mutate({ id: c.id, isActive: !c.is_active })}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {(callNext.error || complete.error || noShow.error || setCounterActive.error) && (
        <div className="flex items-start gap-2 border-t border-[var(--warn)]/40 bg-[var(--warn)]/10 px-5 py-2.5 text-sm text-[var(--warn)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {apiErrorMessage(
              callNext.error || complete.error || noShow.error || setCounterActive.error,
              "That action couldn't be completed.",
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ state }: { state: CounterState }) {
  const color = {
    serving: "var(--cyan-glow)",
    waiting: "var(--warn)",
    idle: "var(--emerald-glow)",
    offline: "var(--muted-foreground)",
  }[state];
  const glow = state === "serving" || state === "waiting";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] font-semibold uppercase tracking-widest"
      style={{
        borderColor: `color-mix(in oklab, ${color} 35%, transparent)`,
        background: `color-mix(in oklab, ${color} 12%, transparent)`,
        color,
      }}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${state === "waiting" ? "pulse-dot" : ""}`}
        style={{ background: color, boxShadow: glow ? `0 0 8px ${color}` : "none" }}
      />
      {COUNTER_STATE_LABEL[state]}
    </span>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  tone,
  onClick,
  disabled,
  pending,
}: {
  icon: any;
  label: string;
  tone: "cyan" | "emerald" | "warn" | "muted";
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
}) {
  const { isLight } = useTheme();
  const color =
    tone === "cyan" ? "var(--cyan-glow)" :
    tone === "emerald" ? "var(--emerald-glow)" :
    tone === "warn" ? "var(--warn)" :
    "rgba(255, 255, 255, 0.6)";
  const bgOpacity = isLight ? 28 : 12;
  const borderOpacity = isLight ? 55 : 35;
  return (
    <motion.button
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-35"
      style={{
        borderColor: `color-mix(in oklab, ${color} ${borderOpacity}%, transparent)`,
        background: `color-mix(in oklab, ${color} ${bgOpacity}%, transparent)`,
        color: isLight ? "#000000" : color,
      }}
    >
      <Icon className="h-3.5 w-3.5" />
      {pending ? "…" : label}
    </motion.button>
  );
}


function fmt(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return "—";
  return digits > 0 ? n.toFixed(digits) : String(Math.round(n));
}
