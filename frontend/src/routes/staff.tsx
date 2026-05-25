import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { motion } from "framer-motion";
import { PhoneCall, SkipForward, AlertOctagon, CheckCircle2, Users, Clock, Gauge, TrendingUp, Building2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  useCounters,
  useDashboard,
  useQueueMutations,
  useTokens,
} from "@/hooks/use-queue-data";
import { KpiCard, type KpiTone } from "@/components/dash/KpiCard";
import type { Counter } from "@/lib/api";

export const Route = createFileRoute("/staff")({
  head: () => ({ meta: [{ title: "Staff Console · SmartQueue" }, { name: "description", content: "Counter operations console." }] }),
  component: StaffPage,
});

const TONES: KpiTone[] = ["cyan", "violet", "emerald", "warn"];

function StaffPage() {
  const { data: counters } = useCounters();
  const { data: stats } = useDashboard();
  const { data: inProgressTokens } = useTokens("IN_PROGRESS");

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const counter = useMemo(() => {
    if (!counters || counters.length === 0) return null;
    return counters.find((c) => c.id === selectedId) ?? counters[0];
  }, [counters, selectedId]);

  const currentToken = useMemo(
    () => inProgressTokens?.find((t) => t.counter === counter?.id) ?? null,
    [inProgressTokens, counter?.id],
  );

  const { callNext, complete, noShow } = useQueueMutations();

  const subtitle = counter
    ? `${counter.name}${counter.location_description ? ` · ${counter.location_description}` : ""}`
    : "No counters available";

  const otherCounters = (counters ?? []).filter((c) => c.id !== counter?.id);

  return (
    <AppShell title="Staff Operations Console" subtitle={subtitle}>
      {counters && counters.length > 1 && (
        <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Counter:</span>
          {counters.map((c) => {
            const active = c.id === counter?.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`rounded-lg border px-3 py-1.5 ${active ? "border-[var(--cyan-glow)]/60 bg-[var(--cyan-glow)]/10 text-[var(--cyan-glow)]" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
              >
                {c.name}
                {!c.is_active && " · offline"}
              </button>
            );
          })}
        </div>
      )}

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          to="/queues"
          tone="cyan"
          icon={Users}
          label="Queue Depth"
          value={counter ? String(counter.queue_depth) : "—"}
          delta={counter ? `${counter.next_tokens.length} ready to serve` : null}
          deltaTone="muted"
          status={counter?.is_active ? "Counter active" : counter ? "Counter offline" : "No counter selected"}
        />
        <KpiCard
          to="/system"
          tone="emerald"
          icon={Gauge}
          label="Avg Service"
          value={stats ? stats.avg_service_minutes.toFixed(1) : "—"}
          unit="min"
          delta={stats ? `window ${stats.window_hours}h` : null}
          deltaTone="muted"
          status={stats && stats.avg_service_minutes < 10 ? "On target" : stats ? "Above target" : "Waiting for backend"}
        />
        <KpiCard
          to="/system"
          tone="violet"
          icon={Clock}
          label="Avg Wait"
          value={stats ? stats.avg_wait_minutes.toFixed(1) : "—"}
          unit="min"
          delta={stats ? `${stats.total_waiting} patients waiting` : null}
          deltaTone="violet"
          status={stats && stats.avg_wait_minutes < 15 ? "Improving wait times" : stats ? "Higher than target" : "—"}
        />
        <KpiCard
          to="/system"
          tone="warn"
          icon={TrendingUp}
          label="Completed"
          value={stats ? String(stats.completed_in_window) : "—"}
          delta={stats ? `last ${stats.window_hours}h` : null}
          deltaTone="warn"
          status={stats && stats.completed_in_window > 0 ? `${stats.completed_in_window} served in window` : "No completions yet"}
        />
      </section>

      <section className="mt-5">
        <Panel className="overflow-hidden">
          <PanelHeader
            title={counter ? `${counter.name} · Now serving` : "Now serving"}
            subtitle={currentToken ? `Token ${currentToken.number} · ${currentToken.patient_name}` : "Idle"}
            accent="cyan"
          />
          <div className="p-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-6 text-center">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Now Serving</div>
                <div className="mt-2 font-mono text-7xl font-bold text-[var(--cyan-glow)]">
                  {currentToken?.number ?? counter?.current_token ?? "—"}
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  {currentToken?.service_start_at
                    ? `Started ${relativeMinutes(currentToken.service_start_at)} ago`
                    : "Waiting to call next"}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Up next</div>
                <div className="mt-2 space-y-2">
                  {(counter?.next_tokens ?? []).length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">Queue empty</div>
                  ) : (
                    counter?.next_tokens.map((t, i) => (
                      <div key={t} className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono">
                        <span className="text-sm text-foreground">{t}</span>
                        <span className="text-[10px] text-muted-foreground">~{(i + 1) * Math.max(1, Math.round(stats?.avg_service_minutes ?? 4))}m</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <ActionButton
                icon={PhoneCall}
                label={callNext.isPending ? "Calling…" : "Call next"}
                tone="cyan"
                onClick={() => counter && callNext.mutate(counter.id)}
                disabled={!counter || !counter.is_active || callNext.isPending || (counter.next_tokens?.length ?? 0) === 0}
              />
              <ActionButton
                icon={CheckCircle2}
                label={complete.isPending ? "Completing…" : "Complete"}
                tone="emerald"
                onClick={() => currentToken && complete.mutate(currentToken.number)}
                disabled={!currentToken || complete.isPending}
              />
              <ActionButton
                icon={SkipForward}
                label={noShow.isPending ? "Marking…" : "No-show"}
                tone="violet"
                onClick={() => currentToken && noShow.mutate(currentToken.number)}
                disabled={!currentToken || noShow.isPending}
              />
              <ActionButton icon={AlertOctagon} label="Emergency override" tone="danger" disabled />
            </div>
            {(callNext.error || complete.error || noShow.error) && (
              <div className="mt-4 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]">
                {String((callNext.error || complete.error || noShow.error) as Error)}
              </div>
            )}
          </div>
        </Panel>
      </section>

      {otherCounters.length > 0 && (
        <section className="mt-5">
          <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Other counters</div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {otherCounters.slice(0, 4).map((c, i) => (
              <CounterMiniCard key={c.id} counter={c} tone={TONES[i % TONES.length]} />
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}

function CounterMiniCard({ counter, tone }: { counter: Counter; tone: KpiTone }) {
  const displayTone: KpiTone = counter.is_active ? tone : "warn";
  return (
    <KpiCard
      to="/queues"
      tone={displayTone}
      icon={Building2}
      label={counter.name}
      value={counter.current_token ?? "—"}
      delta={`${counter.queue_depth} waiting`}
      deltaTone="muted"
      status={
        counter.is_active
          ? counter.next_tokens.length > 0
            ? `Next: ${counter.next_tokens.slice(0, 3).join(" · ")}`
            : "Idle · ready to serve"
          : "Offline"
      }
    />
  );
}

function ActionButton({
  icon: Icon,
  label,
  tone = "cyan",
  onClick,
  disabled,
}: {
  icon: any;
  label: string;
  tone?: "cyan" | "violet" | "emerald" | "danger";
  onClick?: () => void;
  disabled?: boolean;
}) {
  const c = tone === "danger" ? "var(--danger)" : tone === "violet" ? "var(--violet-glow)" : tone === "emerald" ? "var(--emerald-glow)" : "var(--cyan-glow)";
  return (
    <motion.button
      whileHover={disabled ? undefined : { y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        borderColor: `color-mix(in oklab, ${c} 35%, transparent)`,
        background: `color-mix(in oklab, ${c} 10%, transparent)`,
        color: c,
      }}
    >
      <Icon className="h-4 w-4" /> {label}
    </motion.button>
  );
}

function relativeMinutes(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0 || Number.isNaN(diffMs)) return "just now";
  const m = Math.floor(diffMs / 60000);
  const s = Math.floor((diffMs % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
