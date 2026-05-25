import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Filter, Plus, Sparkles, Users, Clock, UserCheck, TrendingUp, Building2 } from "lucide-react";
import { useCounters, useDashboard } from "@/hooks/use-queue-data";
import { KpiCard, type KpiTone } from "@/components/dash/KpiCard";
import type { Counter } from "@/lib/api";
import { counterState, counterStatusText } from "@/lib/counter";

export const Route = createFileRoute("/queues")({
  head: () => ({ meta: [{ title: "Smart Queues · SmartQueue" }, { name: "description", content: "Live queue lanes." }] }),
  component: QueuesPage,
});

const TONES: KpiTone[] = ["cyan", "violet", "emerald", "warn"];

function QueuesPage() {
  const { data: counters, isError, isLoading } = useCounters();
  const { data: stats } = useDashboard();

  return (
    <AppShell
      title="Smart Queue Monitoring"
      subtitle={isError ? "Backend unreachable" : "Live counter state · token routing"}
    >
      <section className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 text-xs">
          {["All zones", "OPD", "Radiology", "ER", "Lab", "Pharmacy"].map((t, i) => (
            <button
              key={t}
              className={`rounded-lg px-3 py-1.5 ${i === 0 ? "bg-[var(--cyan-glow)]/12 text-[var(--cyan-glow)]" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <button className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground">
          <Filter className="h-3.5 w-3.5" /> Filters
        </button>
        <button
          className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-white shadow-[0_8px_20px_-10px_oklch(0.56_0.18_252/0.55)]"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Sparkles className="h-3.5 w-3.5" /> Auto-balance
        </button>
        <button className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground">
          <Plus className="h-3.5 w-3.5" /> Open counter
        </button>
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
            {counters?.length ?? 0} counters
          </span>
        </div>

        {isLoading && <div className="rounded-xl border border-dashed border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">Loading counters…</div>}
        {!isLoading && (!counters || counters.length === 0) && (
          <div className="rounded-xl border border-dashed border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
            No counters configured. Start the backend and seed counters to populate this view.
          </div>
        )}
        {counters && counters.length > 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {counters.map((c, i) => (
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
