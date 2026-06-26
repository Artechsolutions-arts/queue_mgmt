import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { KpiCard } from "@/components/dash/KpiCard";
import { ThroughputChart } from "@/components/dash/ThroughputChart";
import { EventFeed } from "@/components/dash/EventFeed";
import { Cpu, Gauge, Network, Database } from "lucide-react";
import { useCounters, useDashboard, useHealth } from "@/hooks/use-queue-data";

export const Route = createFileRoute("/system")({
  head: () => ({ meta: [{ title: "System Health · SmartQueue" }, { name: "description", content: "Infrastructure mission control." }] }),
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
    <AppShell title="System Health" subtitle={subtitle}>
      <div className={`mb-4 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${apiOk ? "bg-[var(--emerald-glow)]/10 text-[var(--emerald-glow)]" : "bg-[var(--danger)]/10 text-[var(--danger)]"}`}>
        <span className={`h-2 w-2 rounded-full ${apiOk ? "pulse-dot bg-[var(--emerald-glow)]" : "bg-[var(--danger)]"}`} />
        API {apiOk ? "OK" : health.isLoading ? "…" : "DOWN"} · /api/healthz/
      </div>

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          to="/"
          label="API status"
          value={apiOk ? "Operational" : health.isLoading ? "Checking…" : "Down"}
          tone={apiOk ? "emerald" : "danger"}
          icon={Gauge}
          status={apiOk ? "All services healthy" : health.isLoading ? "Probing…" : "queue-service unreachable"}
        />
        <KpiCard
          to="/queues"
          label="Active counters"
          value={`${stats?.active_counters ?? counters?.filter(c => c.is_active).length ?? 0} / ${stats?.total_counters ?? counters?.length ?? 0}`}
          tone="violet"
          icon={Network}
          delta={stats && stats.total_counters ? `${Math.round((stats.active_counters / stats.total_counters) * 100)}% online` : null}
          deltaTone="violet"
          status={stats && stats.active_counters === stats.total_counters ? "All counters active" : "Some counters offline"}
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
          status={stats && stats.avg_wait_minutes < 10 ? "Within target" : stats ? "Above target" : "Waiting for data"}
        />
        <KpiCard
          to="/queues"
          label="Completed"
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
          <PanelHeader title="Token volume · by hour" subtitle="Registrations vs completions" accent="cyan" />
          <ThroughputChart />
        </Panel>
        <Panel className="col-span-12 xl:col-span-4">
          <PanelHeader title="Recent activity" subtitle="Latest token events" accent="emerald" />
          <EventFeed />
        </Panel>
      </section>
    </AppShell>
  );
}
