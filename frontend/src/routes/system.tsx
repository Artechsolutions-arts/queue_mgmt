import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { KpiCard } from "@/components/dash/KpiCard";
import { ThroughputChart } from "@/components/dash/ThroughputChart";
import { EventFeed } from "@/components/dash/EventFeed";
import { Cpu, Gauge, Network, Database } from "lucide-react";
import { useCounters, useDashboard, useHealth } from "@/hooks/use-queue-data";

export const Route = createFileRoute("/system")({
  head: () => ({ meta: [{ title: "System Health · Helix OS" }, { name: "description", content: "ML model + infrastructure mission control." }] }),
  component: SystemPage,
});

function SystemPage() {
  const health = useHealth();
  const { data: counters } = useCounters();
  const { data: stats } = useDashboard();

  const apiOk = health.data?.status === "ok";
  const subtitle = health.isLoading
    ? "Probing /api/healthz/…"
    : apiOk
      ? `queue-service · healthy · ${stats?.active_counters ?? 0}/${stats?.total_counters ?? 0} counters active`
      : "queue-service · UNREACHABLE";

  return (
    <AppShell title="ML & System Health" subtitle={subtitle}>
      <div className={`mb-4 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs ${apiOk ? "bg-[var(--emerald-glow)]/10 text-[var(--emerald-glow)]" : "bg-[var(--danger)]/10 text-[var(--danger)]"}`}>
        <span className={`h-2 w-2 rounded-full pulse-dot ${apiOk ? "bg-[var(--emerald-glow)]" : "bg-[var(--danger)]"}`} />
        API {apiOk ? "OK" : health.isLoading ? "…" : "DOWN"} · /api/healthz/
      </div>
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          to="/system"
          label="API status"
          value={apiOk ? "Operational" : "Down"}
          tone={apiOk ? "emerald" : "danger"}
          icon={Gauge}
          status={apiOk ? "All services are healthy" : "queue-service unreachable"}
        />
        <KpiCard
          to="/queues"
          label="Active counters"
          value={`${stats?.active_counters ?? counters?.filter(c => c.is_active).length ?? 0} / ${stats?.total_counters ?? counters?.length ?? 0}`}
          tone="violet"
          icon={Network}
          delta={stats && stats.total_counters ? `${Math.round((stats.active_counters / stats.total_counters) * 100)}% online` : null}
          deltaTone="violet"
          status={stats && stats.active_counters === stats.total_counters ? "All counters are active" : "Some counters offline"}
        />
        <KpiCard
          to="/queues"
          label="Avg wait"
          value={stats ? stats.avg_wait_minutes.toFixed(1) : "—"}
          unit="min"
          tone="cyan"
          icon={Cpu}
          delta={stats ? `window ${stats.window_hours}h` : null}
          deltaTone="muted"
          status={stats && stats.avg_wait_minutes < 10 ? "Improving wait times" : stats ? "Higher than target" : "Waiting for backend"}
        />
        <KpiCard
          to="/queues"
          label="Completed (window)"
          value={String(stats?.completed_in_window ?? 0)}
          tone="warn"
          icon={Database}
          delta={stats ? `avg svc ${stats.avg_service_minutes.toFixed(1)} min` : null}
          deltaTone="warn"
          status={stats && stats.completed_in_window > 0 ? `${stats.completed_in_window} served in window` : "No completions yet"}
        />
      </section>

      <section className="mt-5 grid grid-cols-12 gap-5">
        <Panel className="col-span-12 xl:col-span-8">
          <PanelHeader title="API latency · last 24h" subtitle="mock · backend doesn't expose latency metrics yet" accent="cyan" />
          <ThroughputChart />
        </Panel>
        <Panel className="col-span-12 xl:col-span-4">
          <PanelHeader title="Container fleet" subtitle="mock · only queue-service /healthz is wired (badge above)" accent="emerald" />
          <div className="space-y-2 p-4">
            {[
              { n: "queue-forecaster", v: "v2.4.1", c: "var(--emerald-glow)" },
              { n: "ws-gateway", v: "v1.8.0", c: "var(--emerald-glow)" },
              { n: "yolov8-cctv", v: "v3.1.4", c: "var(--cyan-glow)" },
              { n: "whatsapp-bridge", v: "v0.9.7", c: "var(--emerald-glow)" },
              { n: "redis-stream", v: "7.2", c: "var(--violet-glow)" },
              { n: "mlflow-tracker", v: "2.14", c: "var(--cyan-glow)" },
            ].map((s) => (
              <div key={s.n} className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/50 px-3 py-2">
                <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full pulse-dot" style={{ background: s.c, boxShadow: `0 0 8px ${s.c}` }} /><span className="font-mono text-xs text-foreground">{s.n}</span></div>
                <span className="font-mono text-[10px] text-muted-foreground">{s.v}</span>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="mt-5 grid grid-cols-12 gap-5">
        <Panel className="col-span-12 xl:col-span-7">
          <PanelHeader title="MLflow experiments" subtitle="mock · wire to MLflow tracking server on port 5000" accent="violet" />
          <div className="divide-y divide-border/40">
            {[
              { id: "run-8821", model: "queue_forecaster_v2.4.1", mae: 0.84, status: "deployed", c: "var(--emerald-glow)" },
              { id: "run-8820", model: "queue_forecaster_v2.4.0", mae: 0.91, status: "archived", c: "var(--muted-foreground)" },
              { id: "run-8819", model: "anomaly_density_v1.2", mae: 0.62, status: "staging", c: "var(--cyan-glow)" },
              { id: "run-8818", model: "ivr_intent_v0.7", mae: 1.04, status: "training", c: "var(--warn)" },
            ].map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="font-mono text-xs text-foreground">{r.model}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{r.id} · MAE {r.mae}</div>
                </div>
                <span className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-widest" style={{ background: `color-mix(in oklab, ${r.c} 15%, transparent)`, color: r.c }}>{r.status}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="col-span-12 xl:col-span-5">
          <PanelHeader title="Infrastructure events" subtitle="Live stream" accent="emerald" />
          <EventFeed />
        </Panel>
      </section>
    </AppShell>
  );
}