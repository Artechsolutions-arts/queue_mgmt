import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Filter, Plus, Users, Clock, UserCheck, TrendingUp, Building2, Loader2, AlertTriangle } from "lucide-react";
import { useCounters, useDashboard, useQueueMutations } from "@/hooks/use-queue-data";
import { KpiCard, type KpiTone } from "@/components/dash/KpiCard";
import type { Counter } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api";
import { counterState, counterStatusText, counterZone, ZONE_ORDER } from "@/lib/counter";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/queues")({
  head: () => ({ meta: [{ title: "Smart Queues · SmartQueue" }, { name: "description", content: "Live queue lanes." }] }),
  component: QueuesPage,
});

const TONES: KpiTone[] = ["cyan", "violet", "emerald", "warn"];

function QueuesPage() {
  const { data: counters, isError, isLoading } = useCounters();
  const { data: stats } = useDashboard();
  const { setCounterActive } = useQueueMutations();
  const { isLight } = useTheme();

  const [zone, setZone] = useState("All zones");
  const [waitingOnly, setWaitingOnly] = useState(false);

  const all = counters ?? [];

  // Zone pills come from the actual data — "All zones" plus whatever zones the
  // current counters fall into (so no dead/irrelevant filters).
  const zones = useMemo(() => {
    const present = Array.from(new Set(all.map(counterZone)));
    present.sort((a, b) => {
      const ai = ZONE_ORDER.indexOf(a), bi = ZONE_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
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

  const offlineCounters = all.filter((c) => !c.is_active);
  const openCounter = () => {
    offlineCounters.forEach((c) => setCounterActive.mutate({ id: c.id, isActive: true }));
  };

  return (
    <AppShell
      title="Smart Queue Monitoring"
      subtitle={isError ? "Backend unreachable" : "Live counter state · token routing"}
    >
      <section className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 text-base">
          {zones.map((t) => (
            <button
              key={t}
              onClick={() => setZone(t)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                zone === t
                  ? "bg-[var(--cyan-glow)]/15 text-[var(--cyan-glow)] ring-1 ring-[var(--cyan-glow)]/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={() => setWaitingOnly((v) => !v)}
          className={`ml-auto inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-base transition ${
            waitingOnly
              ? "border-[var(--warn)]/50 bg-[var(--warn)]/10 text-[var(--warn)]"
              : "border-border bg-card text-foreground hover:bg-muted/60"
          }`}
        >
          <Filter className="h-3.5 w-3.5" /> {waitingOnly ? "Waiting only" : "All counters"}
        </button>
        <button
          onClick={openCounter}
          disabled={offlineCounters.length === 0 || setCounterActive.isPending}
          title={offlineCounters.length > 0 ? `Activate ${offlineCounters.length} offline counter${offlineCounters.length > 1 ? "s" : ""}` : "All counters are open"}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-base !text-white transition disabled:opacity-100"
          style={{ background: "var(--gradient-violet)" }}
        >
          {setCounterActive.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {offlineCounters.length > 1 ? `Open all (${offlineCounters.length})` : "Open counter"}
        </button>
      </section>

      {setCounterActive.error && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-[var(--warn)]/40 bg-[var(--warn)]/8 px-4 py-2.5 text-sm text-[var(--warn)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {apiErrorMessage(setCounterActive.error, "Could not update counter status.")}
        </div>
      )}

      {/* Drill-down for "Patients Waiting": which counters have a queue right now. */}
      <section className="mb-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Patients waiting</h3>
            <p className="text-[15px] text-muted-foreground">Counters with someone in the queue right now</p>
          </div>
          <span className="text-[14px] uppercase tracking-widest text-foreground">
            {waiting.length} {waiting.length === 1 ? "counter" : "counters"}
          </span>
        </div>
        {waiting.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card px-5 py-8 text-center text-lg text-muted-foreground">
            {isLoading ? "Loading queues…" : "No patients waiting — all queues are clear."}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {waiting.map((c) => (
              <Link
                key={c.id}
                to="/staff"
                className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3 transition hover:opacity-90"
                style={{ background: isLight ? "linear-gradient(135deg, oklch(0.82 0.12 290), oklch(0.88 0.10 255))" : "var(--gradient-violet)" }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Building2 className={`h-4 w-4 shrink-0 ${isLight ? "text-black" : "text-white"}`} />
                    <span className={`truncate font-medium ${isLight ? "text-black" : "text-white"}`}>{c.name}</span>
                  </div>
                  {c.location_description && (
                    <div className={`mt-0.5 truncate text-[15px] ${isLight ? "text-black/70" : "text-white/80"}`}>{c.location_description}</div>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {c.next_tokens.slice(0, 4).map((t) => (
                      <span key={t} className={`rounded-md px-1.5 py-0.5 font-mono text-[14px] ${isLight ? "border border-black/20 bg-black/10 text-black" : "border border-white/20 bg-white/10 text-white"}`}>
                        {t}
                      </span>
                    ))}
                    {c.next_tokens.length > 4 && (
                      <span className={`self-center text-[14px] ${isLight ? "text-black/50" : "text-white/50"}`}>+{c.next_tokens.length - 4} more</span>
                    )}
                  </div>
                </div>
                <div className="ml-3 text-right">
                  <div className={`font-mono text-[28px] font-semibold tabular-nums ${isLight ? "text-black" : "text-white"}`}>{c.queue_depth}</div>
                  <div className={`text-[14px] uppercase tracking-widest ${isLight ? "text-black" : "text-white"}`}>waiting</div>
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
            <h3 className="text-lg font-semibold text-foreground">Counter status</h3>
            <p className="text-[15px] text-muted-foreground">Live per-counter occupancy from /api/counters/</p>
          </div>
          <span className="text-[14px] uppercase tracking-widest text-muted-foreground">
            {isError ? "— counters" : `${visible.length} of ${all.length} counters`}
          </span>
        </div>

        {isLoading && <div className="rounded-xl border border-dashed border-border bg-card px-5 py-8 text-center text-lg text-muted-foreground">Loading counters…</div>}
        {!isLoading && isError && (
          <div className="rounded-xl border border-dashed border-[var(--danger)]/40 bg-[var(--danger)]/5 px-5 py-8 text-center text-lg text-[var(--danger)]">
            Backend unreachable — start the queue service and refresh.
          </div>
        )}
        {!isLoading && !isError && all.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card px-5 py-8 text-center text-lg text-muted-foreground">
            No counters seeded — run <code className="font-mono text-base">make seed</code> to populate counters.
          </div>
        )}
        {!isLoading && !isError && all.length > 0 && visible.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card px-5 py-8 text-center text-lg text-muted-foreground">
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
  // offline → violet (counter is down — informational, not as urgent as a backed-up queue)
  // waiting → warn  (patients in queue but nobody calling — needs attention)
  const displayTone: KpiTone =
    state === "offline" ? "violet" : state === "waiting" ? "warn" : tone;
  const depth = counter.queue_depth ?? 0;
  const deltaText = depth > 0 ? `${depth} waiting` : "Queue clear";
  return (
    <KpiCard
      to="/staff"
      tone={displayTone}
      icon={Building2}
      label={counter.name}
      value={counter.current_token ?? "—"}
      delta={deltaText}
      deltaTone={depth > 0 ? "warn" : "good"}
      status={counterStatusText(counter)}
    />
  );
}
