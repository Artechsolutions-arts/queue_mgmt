import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Filter, Plus, Users, Clock, UserCheck, TrendingUp, Building2, Loader2 } from "lucide-react";
import { useCounters, useDashboard, useQueueMutations } from "@/hooks/use-queue-data";
import { KpiCard, type KpiTone } from "@/components/dash/KpiCard";
import type { Counter } from "@/lib/api";
import { counterState, counterStatusText, counterZone } from "@/lib/counter";

export const Route = createFileRoute("/queues")({
  head: () => ({ meta: [{ title: "Smart Queues · SmartQueue" }, { name: "description", content: "Live queue lanes." }] }),
  component: QueuesPage,
});

const TONES: KpiTone[] = ["cyan", "violet", "emerald", "warn"];

function QueuesPage() {
  const { data: counters, isError, isLoading } = useCounters();
  const { data: stats } = useDashboard();
  const { setCounterActive } = useQueueMutations();

  const [zone, setZone] = useState("All zones");
  const [waitingOnly, setWaitingOnly] = useState(false);

  const all = counters ?? [];

  // Zone pills come from the actual data — "All zones" plus whatever zones the
  // current counters fall into (so no dead/irrelevant filters).
  const zones = useMemo(() => {
    const present = Array.from(new Set(all.map(counterZone)));
    const order = ["OPD", "Radiology", "Lab", "Cardiology", "Endoscopy", "Emergency", "Pharmacy"];
    present.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return ["All zones", ...present];
  }, [all]);

  const hasQueue = (c: Counter) => (c.queue_depth ?? 0) > 0 || (c.next_tokens?.length ?? 0) > 0;

  // Apply the toolbar filters (zone + "waiting only") to the counter list.
  const visible = all.filter(
    (c) => (zone === "All zones" || counterZone(c) === zone) && (!waitingOnly || hasQueue(c)),
  );

  // "Patients Waiting" drill-down, busiest first, respecting the zone filter.
  const waiting = visible
    .filter(hasQueue)
    .sort((a, b) => (b.queue_depth ?? 0) - (a.queue_depth ?? 0));

  const offlineCounter = all.find((c) => !c.is_active);
  const openCounter = () => {
    if (offlineCounter) setCounterActive.mutate({ id: offlineCounter.id, isActive: true });
  };

  return (
    <AppShell
      title="Smart Queue Monitoring"
      subtitle={isError ? "Backend unreachable" : "Live counter state · token routing"}
    >
      <section className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 text-xs">
          {zones.map((t) => (
            <button
              key={t}
              onClick={() => setZone(t)}
              className={`rounded-lg px-3 py-1.5 transition ${
                zone === t
                  ? "bg-[var(--cyan-glow)]/12 text-[var(--cyan-glow)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={() => setWaitingOnly((v) => !v)}
          className={`ml-auto inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs transition ${
            waitingOnly
              ? "border-[var(--warn)]/50 bg-[var(--warn)]/10 text-[var(--warn)]"
              : "border-border bg-card text-foreground hover:bg-muted/60"
          }`}
        >
          <Filter className="h-3.5 w-3.5" /> {waitingOnly ? "Waiting only" : "All counters"}
        </button>
        <button
          onClick={openCounter}
          disabled={!offlineCounter || setCounterActive.isPending}
          title={offlineCounter ? `Open ${offlineCounter.name}` : "All counters are open"}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground transition hover:bg-muted/60 disabled:opacity-40"
        >
          {setCounterActive.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Open counter
        </button>
      </section>

      {/* Drill-down for "Patients Waiting": which counters have a queue right now. */}
      <section className="mb-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Patients waiting</h3>
            <p className="text-[11px] text-muted-foreground">Counters with someone in the queue right now</p>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {waiting.length} {waiting.length === 1 ? "counter" : "counters"}
          </span>
        </div>
        {waiting.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
            {isLoading ? "Loading queues…" : "No patients waiting — all queues are clear."}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {waiting.map((c) => (
              <Link
                key={c.id}
                to="/staff"
                className="flex items-center justify-between rounded-xl border border-[var(--warn)]/30 bg-[var(--warn)]/5 px-4 py-3 transition hover:border-[var(--warn)]/60"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 shrink-0 text-[var(--warn)]" />
                    <span className="truncate font-medium text-foreground">{c.name}</span>
                  </div>
                  {c.location_description && (
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{c.location_description}</div>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {c.next_tokens.slice(0, 4).map((t) => (
                      <span key={t} className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                        {t}
                      </span>
                    ))}
                    {c.next_tokens.length > 4 && (
                      <span className="self-center text-[10px] text-muted-foreground">+{c.next_tokens.length - 4} more</span>
                    )}
                  </div>
                </div>
                <div className="ml-3 text-right">
                  <div className="font-mono text-2xl font-semibold tabular-nums text-[var(--warn)]">{c.queue_depth}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">waiting</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          to="/staff"
          tone="cyan"
          icon={Users}
          label="Patients Waiting"
          value={stats ? String(stats.total_waiting) : "—"}
          delta={stats ? `${stats.total_in_progress} in progress` : null}
          deltaTone="muted"
          status={stats && stats.total_waiting > 0 ? `${stats.total_waiting} in queue` : "Queue clear"}
        />
        <KpiCard
          to="/system"
          tone="emerald"
          icon={Clock}
          label="Avg Wait"
          value={stats ? stats.avg_wait_minutes.toFixed(1) : "—"}
          unit="min"
          delta={stats ? `window ${stats.window_hours}h` : null}
          deltaTone="good"
          status={stats && stats.avg_wait_minutes < 10 ? "Improving wait times" : stats ? "Higher than target" : "—"}
        />
        <KpiCard
          to="/staff"
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
          tone="warn"
          icon={TrendingUp}
          label="Completed"
          value={stats ? String(stats.completed_in_window) : "—"}
          delta={stats ? `avg svc ${stats.avg_service_minutes.toFixed(1)} min` : null}
          deltaTone="warn"
          status={stats && stats.completed_in_window > 0 ? `${stats.completed_in_window} served in window` : "No completions yet"}
        />
      </section>

      <section className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Counter status</h3>
            <p className="text-[11px] text-muted-foreground">Live per-counter occupancy from /api/counters/</p>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {visible.length} of {all.length} counters
          </span>
        </div>

        {isLoading && <div className="rounded-xl border border-dashed border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">Loading counters…</div>}
        {!isLoading && all.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
            No counters configured. Start the backend and seed counters to populate this view.
          </div>
        )}
        {!isLoading && all.length > 0 && visible.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
            No counters match this filter.
          </div>
        )}
        {visible.length > 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {visible.map((c, i) => (
              <CounterTile key={c.id} counter={c} tone={TONES[i % TONES.length]} />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function CounterTile({ counter, tone }: { counter: Counter; tone: KpiTone }) {
  const state = counterState(counter);
  // Surface a queued-but-not-serving counter as "warn" so it stands out.
  const displayTone: KpiTone =
    state === "offline" ? "warn" : state === "waiting" ? "warn" : tone;
  return (
    <KpiCard
      to="/staff"
      tone={displayTone}
      icon={Building2}
      label={counter.name}
      value={counter.current_token ?? "—"}
      delta={`${counter.queue_depth} waiting · ${counter.next_tokens.length} ready`}
      deltaTone="muted"
      status={counterStatusText(counter)}
    />
  );
}
